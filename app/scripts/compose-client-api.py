"""Compose the authenticated HTTP API from the existing business handlers.

Run before deployment. Does not invoke any endpoint or alter cloud data.
"""
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'cloudfunctions'
destination = root / 'client-api' / 'business'
names = ['route-manage', 'social-manage', 'companion-create', 'companion-list', 'companion-join', 'companion-report', 'companion-manage', 'team-manage', 'library-manage', 'community-moderate',
         'team-create', 'team-join', 'team-leave', 'team-stop', 'team-report',
         'team-locations', 'track-sync', 'track-manage', 'sos-trigger', 'guide-list']
for name in names:
    source = (root / name / 'index.js').read_text()
    source = source.replace('const { OPENID } = cloud.getWXContext();',
                            "const OPENID = require('../../identity').currentIdentity();")
    if name in ['companion-list','route-manage']:
        source = source.replace('currentIdentity()', 'optionalIdentity()')
    if 'getWXContext' in source:
        raise RuntimeError(f'Unconverted identity access: {name}')
    target = destination / name
    target.mkdir(parents=True, exist_ok=True)
    (target / 'index.js').write_text(source)
print(f'Composed {len(names)} handlers; original mini-program functions unchanged.')
