"""Publish only traceable metadata links; expire freshness, not trail permission."""
import datetime as dt
from urllib.parse import urlsplit

MAX_METADATA_AGE = dt.timedelta(days=90)
MAX_FEED_VERIFICATION_AGE = dt.timedelta(days=90)


def feed_acceptance_error(source, now):
    """Require a dated, current acceptance when a feed opts into gated publication."""
    acceptance = source.get('feedAcceptance')
    if acceptance is None:
        return None
    if acceptance != 'accepted':
        return 'source-feed-not-accepted'
    try:
        raw_date = source['feedVerifiedAt']
        verified = dt.date.fromisoformat(raw_date)
        if not isinstance(raw_date, str) or verified.isoformat() != raw_date:
            return 'source-feed-verification-invalid'
    except (KeyError, TypeError, ValueError):
        return 'source-feed-verification-invalid'
    today = now.date()
    if verified > today:
        return 'source-feed-verification-future'
    if today - verified > MAX_FEED_VERIFICATION_AGE:
        return 'source-feed-verification-expired'
    return None


def review_metadata(row, sources, now):
    if not isinstance(row, dict): return 'invalid-record'
    if not isinstance(row.get('sourceId'), str): return 'invalid-source-id'
    source = sources.get(row.get('sourceId'))
    if not source or source.get('reuse') != 'metadata-links-only': return 'source-not-approved'
    feed_error = feed_acceptance_error(source, now)
    if feed_error: return feed_error
    if row.get('verified') is not True or row.get('sourceUrl') != source.get('url'):
        return 'provenance-mismatch'
    if not isinstance(row.get('id'), str) or not row['id'].strip() or len(row['id']) > 160: return 'invalid-record-id'
    if not isinstance(row.get('title'), str) or not row['title'].strip() or len(row['title']) > 300: return 'missing-title'
    if any(not isinstance(row.get(key), str) or not row[key].strip() for key in ('region', 'sourceLabel')):
        return 'missing-attribution'
    if any(key in row for key in ('body', 'articleBody', 'image', 'imageUrl')):
        return 'unsupported-content-rights'
    try:
        url = urlsplit(row.get('url', ''))
        hosts = source.get('articleHosts')
        if not isinstance(hosts, list) or not hosts:
            return 'source-not-approved'
        if (url.scheme != 'https' or url.hostname not in hosts
                or url.username or url.password or url.port): return 'article-host-mismatch'
        fetched = dt.datetime.fromisoformat(row['fetchedAt'].replace('Z', '+00:00'))
        if fetched.tzinfo is None or fetched.utcoffset() is None: return 'invalid-freshness-date'
        published = dt.datetime.fromisoformat(row['publishedAt'].replace('Z', '+00:00'))
        if published.tzinfo is None or published.utcoffset() is None: return 'invalid-publication-date'
    except (ValueError, TypeError, KeyError, AttributeError): return 'invalid-record'
    if fetched > now + dt.timedelta(minutes=5): return 'future-freshness-date'
    if now - fetched > MAX_METADATA_AGE: return 'metadata-freshness-expired'
    if published > now + dt.timedelta(minutes=5): return 'future-publication-date'
    if 'center' in row:
        center = row['center']
        if (not isinstance(center, list) or len(center) != 2
                or any(isinstance(value, bool) or not isinstance(value, (int, float))
                       for value in center)
                or not -180 <= center[0] <= 180 or not -90 <= center[1] <= 90):
            return 'invalid-center'
    return None


def apply_metadata_policy(rows, registry, now):
    sources = {source['id']: source for source in registry}
    published, withheld = [], []
    for row in rows:
        reason = review_metadata(row, sources, now)
        if reason:
            withheld.append({'record': row, 'reason': reason, 'reviewedAt': now.isoformat()})
        else:
            published.append(row)
    return published, withheld
