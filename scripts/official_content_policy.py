"""Publish only traceable metadata links; expire freshness, not trail permission."""
import datetime as dt
from urllib.parse import urlsplit

MAX_METADATA_AGE = dt.timedelta(days=90)


def review_metadata(row, sources, now):
    if not isinstance(row, dict): return 'invalid-record'
    if not isinstance(row.get('sourceId'), str): return 'invalid-source-id'
    source = sources.get(row.get('sourceId'))
    if not source or source.get('reuse') != 'metadata-links-only': return 'source-not-approved'
    acceptance = source.get('feedAcceptance')
    if acceptance is not None and acceptance != 'accepted': return 'source-feed-not-accepted'
    if row.get('verified') is not True or row.get('sourceUrl') != source.get('url'):
        return 'provenance-mismatch'
    if not isinstance(row.get('title'), str) or not row['title'].strip(): return 'missing-title'
    if any(key in row for key in ('body', 'articleBody', 'image', 'imageUrl')):
        return 'unsupported-content-rights'
    try:
        url = urlsplit(row.get('url', ''))
        if (url.scheme != 'https' or url.hostname not in source.get('articleHosts', [])
                or url.username or url.password or url.port): return 'article-host-mismatch'
        fetched = dt.datetime.fromisoformat(row['fetchedAt'].replace('Z', '+00:00'))
        if fetched.tzinfo is None: return 'invalid-freshness-date'
    except (ValueError, TypeError, KeyError, AttributeError): return 'invalid-record'
    if fetched > now + dt.timedelta(minutes=5): return 'future-freshness-date'
    if now - fetched > MAX_METADATA_AGE: return 'metadata-freshness-expired'
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
