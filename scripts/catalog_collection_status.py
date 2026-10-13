"""Build explicit per-source status for the scheduled catalog workflow."""
from collections import Counter
from datetime import date, datetime, timezone
import re

MAX_FEED_VERIFICATION_AGE_DAYS = 90


def news_source_status(source, state, record_count, now=None):
    now = now or datetime.now(timezone.utc)
    state = state if isinstance(state, dict) else {}
    last_error = state.get('lastError')
    last_success = state.get('lastSuccess')
    collection_status = 'failed' if last_error else 'available' if last_success else 'pending'

    acceptance = source.get('feedAcceptance')
    verified_at = source.get('feedVerifiedAt')
    if acceptance is None:
        feed_status, feed_verified = 'legacy-no-explicit-acceptance', None
    elif acceptance != 'accepted':
        feed_status, feed_verified = 'not-accepted', False
    else:
        try:
            verified_date = date.fromisoformat(verified_at)
            if not isinstance(verified_at, str) or verified_date.isoformat() != verified_at:
                raise ValueError('non-canonical feed verification date')
        except (TypeError, ValueError):
            feed_status, feed_verified = 'invalid-verification-date', False
        else:
            today = now.date()
            age = (today - verified_date).days
            if age < 0:
                feed_status, feed_verified = 'future-verification-date', False
            elif age > MAX_FEED_VERIFICATION_AGE_DAYS:
                feed_status, feed_verified = 'verification-expired', False
            else:
                feed_status, feed_verified = 'current', True

    return {
        'id': source['id'],
        'status': collection_status,
        'records': record_count,
        'lastCollectedCount': state.get('lastCollectedCount'),
        'lastAttempt': state.get('lastAttempt'),
        'lastSuccess': last_success,
        'feedAcceptance': acceptance,
        'feedVerifiedAt': verified_at,
        'feedVerificationStatus': feed_status,
        'feedVerified': feed_verified,
    }


def pbf_refresh_status(report, now=None):
    """Summarize one regional PBF refresh without implying access verification."""
    now = now or datetime.now(timezone.utc)
    if not isinstance(report, dict) or report.get('schemaVersion') != 1:
        raise ValueError('unsupported PBF refresh report')
    region = report.get('region')
    if region not in {'africa', 'asia', 'europe', 'south-america', 'oceania', 'north-america', 'china', 'japan'}:
        raise ValueError('unsupported PBF refresh region')

    source_rows = report.get('sources')
    if not isinstance(source_rows, list):
        raise ValueError('PBF refresh sources are missing')
    latest = {}
    for row in source_rows:
        if not isinstance(row, dict) or not isinstance(row.get('sourceId'), str):
            continue
        latest[row['sourceId']] = row
    counts = Counter(row.get('result', 'unknown') for row in latest.values())
    runs = report.get('runs') if isinstance(report.get('runs'), list) else []
    last_run = report.get('lastRun') if isinstance(report.get('lastRun'), dict) else (runs[-1] if runs and isinstance(runs[-1], dict) else {})
    source_timestamps = []
    for row in latest.values():
        imported = row.get('import')
        stamp = imported.get('sourceTimestamp') if isinstance(imported, dict) else None
        if isinstance(stamp, str):
            try:
                parsed = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
                if parsed.tzinfo is not None:
                    source_timestamps.append(parsed.astimezone(timezone.utc))
            except ValueError:
                pass

    completed = report.get('completedAt')
    return {
        'region': region,
        'sourcePage': report.get('sourcePage'),
        'lastStartedAt': last_run.get('startedAt') or report.get('startedAt'),
        'lastCompletedAt': last_run.get('completedAt') or completed,
        'lastRunSuccessCount': last_run.get('successCount', report.get('successCount')),
        'lastRunFailureCount': last_run.get('failureCount', report.get('failureCount')),
        'latestSourceCount': len(latest),
        'latestSourceResults': dict(sorted(counts.items())),
        'oldestSourceTimestamp': min(source_timestamps).isoformat() if source_timestamps else None,
        'newestSourceTimestamp': max(source_timestamps).isoformat() if source_timestamps else None,
        'catalogDelta': last_run.get('catalogDelta') or report.get('catalogDelta'),
        'accessVerified': False,
        'navigableGeometryAdded': False,
    }


def pbf_catalog_coverage(catalog):
    """Describe every imported PBF region and expose where no schedule exists."""
    if not isinstance(catalog, dict) or not isinstance(catalog.get('pbfImports'), list):
        raise ValueError('OSM PBF import inventory is missing')
    groups = {}
    for row in catalog['pbfImports']:
        if not isinstance(row, dict) or not isinstance(row.get('region'), str):
            continue
        region = row['region']
        bucket = groups.setdefault(region, {'sourceIds': set(), 'bytes': 0, 'importedRelations': 0,
                                             'sourceTimestamps': [], 'importedAt': []})
        if isinstance(row.get('sourceId'), str):
            bucket['sourceIds'].add(row['sourceId'])
        if isinstance(row.get('bytes'), int) and not isinstance(row['bytes'], bool) and row['bytes'] >= 0:
            bucket['bytes'] += row['bytes']
        if isinstance(row.get('importedRelations'), int) and not isinstance(row['importedRelations'], bool) and row['importedRelations'] >= 0:
            bucket['importedRelations'] += row['importedRelations']
        for field, output in (('sourceTimestamp', 'sourceTimestamps'), ('importedAt', 'importedAt')):
            value = row.get(field)
            if not isinstance(value, str):
                continue
            try:
                parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
                if parsed.tzinfo is not None:
                    bucket[output].append(parsed.astimezone(timezone.utc))
            except ValueError:
                continue

    return [
        {
            'region': region,
            'sourceCount': len(bucket['sourceIds']),
            'importedBytes': bucket['bytes'],
            'sourceRelationImports': bucket['importedRelations'],
            'oldestSourceTimestamp': min(bucket['sourceTimestamps']).isoformat() if bucket['sourceTimestamps'] else None,
            'newestSourceTimestamp': max(bucket['sourceTimestamps']).isoformat() if bucket['sourceTimestamps'] else None,
            'latestImportedAt': max(bucket['importedAt']).isoformat() if bucket['importedAt'] else None,
            'scheduledRefresh': region in {'africa', 'asia', 'europe', 'south-america', 'oceania', 'north-america', 'china', 'japan'},
            'accessVerified': False,
            'navigableGeometryAdded': False,
        }
        for region, bucket in sorted(groups.items())
    ]


def pbf_route_provenance_status(catalog):
    """Report migration progress without implying complete source coverage."""
    routes = catalog.get('routes') if isinstance(catalog, dict) else None
    if not isinstance(routes, list):
        raise ValueError('OSM route catalog is missing')
    attributed = 0
    source_ids = set()
    invalid = 0
    for row in routes:
        if not isinstance(row, dict):
            invalid += 1
            continue
        sources = row.get('pbfSources')
        if sources is None:
            continue
        if (not isinstance(sources, list)
                or any(not isinstance(source, str)
                       or re.fullmatch(r'[a-z0-9][a-z0-9/_-]{0,99}', source) is None for source in sources)
                or len(set(sources)) != len(sources)):
            invalid += 1
            continue
        if sources:
            attributed += 1
            source_ids.update(sources)
    total = len(routes)
    return {
        'totalRoutes': total,
        'routesWithPbfSource': attributed,
        'legacyOrUnattributedRoutes': total - attributed - invalid,
        'invalidProvenanceRoutes': invalid,
        'sourceIds': len(source_ids),
        'coverageFraction': round(attributed / total, 6) if total else 1.0,
        'completeCoverage': total == attributed and invalid == 0,
        'safeForGlobalWithdrawal': False,
    }
