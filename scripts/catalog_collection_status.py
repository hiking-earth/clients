"""Build explicit per-source status for the scheduled catalog workflow."""
from datetime import date, datetime, timezone

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
