"""Acceptance structure for the agreed free iPhone PWA delivery path.

These checks require evidence references; reviewers still need to inspect them.
They do not perform device testing or certify the referenced evidence.
"""
IPHONE_CHECKS = ('installation', 'offlineRestore', 'permissionWithdrawal', 'update')


def require_iphone_acceptance(platforms, store_url=None):
    ios = platforms.get('ios') if isinstance(platforms, dict) else None
    if not isinstance(ios, dict) or ios.get('status') != 'passed':
        raise SystemExit('Actual iPhone acceptance required; owner signing hold is not PWA acceptance')
    delivery = ios.get('delivery')
    if delivery not in ('pwa', 'native'):
        raise SystemExit('iPhone acceptance must identify pwa or native delivery')
    if store_url and delivery != 'native':
        raise SystemExit('PWA acceptance cannot advertise a native iOS store entry')
    if ios.get('device') != 'physical-iphone':
        raise SystemExit('iPhone acceptance requires a physical iPhone, not desktop emulation')
    checks = ios.get('checks')
    if not isinstance(checks, dict):
        raise SystemExit('iPhone acceptance checks are missing')
    for name in IPHONE_CHECKS:
        row = checks.get(name)
        if (not isinstance(row, dict) or row.get('status') != 'passed'
                or not isinstance(row.get('evidence'), list) or not row['evidence']
                or any(not isinstance(item, str) or not item.strip() for item in row['evidence'])):
            raise SystemExit('iPhone check requires passed status and evidence: ' + name)
