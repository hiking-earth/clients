"""Compose the authenticated HTTP API from the existing business handlers.

Run before deployment. Does not invoke any endpoint or alter cloud data.
"""
from pathlib import Path
import os
import re
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1] / 'cloudfunctions'
destination = root / 'client-api' / 'business'
names = ['catalog-feed', 'route-manage', 'social-manage', 'companion-create', 'companion-list', 'companion-join', 'companion-report', 'companion-manage', 'team-manage', 'library-manage', 'community-moderate',
         'team-create', 'team-join', 'team-leave', 'team-stop', 'team-report',
         'team-locations', 'team-current', 'track-sync', 'track-manage', 'sos-trigger', 'guide-list']
if len(names) != len(set(names)):
    raise RuntimeError('Duplicate HTTP business handler in composition list')

router = (root / 'client-api' / 'index.js').read_text()

def router_set(constant):
    match = re.search(rf"const {constant} = new Set\(\[([\s\S]*?)\]\);", router)
    if not match:
        raise RuntimeError(f'Missing {constant} in the HTTP gateway')
    return re.findall(r"'([^']+)'", match.group(1))

router_handlers = router_set('handlers')
if len(router_handlers) != len(set(router_handlers)) or set(router_handlers) != set(names):
    missing = sorted(set(router_handlers) - set(names))
    unreachable = sorted(set(names) - set(router_handlers))
    raise RuntimeError(f'HTTP gateway and business composition differ; missing={missing}, unreachable={unreachable}')
public_handlers = router_set('publicHandlers')
if len(public_handlers) != len(set(public_handlers)) or not set(public_handlers).issubset(names):
    raise RuntimeError('HTTP public handler list must be unique and included in business composition')

composed = {}
for name in names:
    source = (root / name / 'index.js').read_text()
    source = source.replace('const { OPENID } = cloud.getWXContext();',
                            "const OPENID = require('../../identity').currentIdentity();")
    if name in ['companion-list','route-manage']:
        source = source.replace('currentIdentity()', 'optionalIdentity()')
    if 'getWXContext' in source:
        raise RuntimeError(f'Unconverted identity access: {name}')
    composed[name] = source

# Artifact preprocessing only, never a product build or cloud operation. Do it
# only after the handler/router parity checks have passed.
destination.parent.mkdir(parents=True, exist_ok=True)
backup = destination.with_name(f'{destination.name}.backup')
if backup.exists():
    raise RuntimeError(f'Previous business source backup needs recovery: {backup.name}')
subprocess.run([sys.executable, str(Path(__file__).resolve().parents[2] / 'scripts/prepare-catalog-pages.py')], check=True)
stage = Path(tempfile.mkdtemp(prefix='business-stage-', dir=destination.parent))
try:
    for name, source in composed.items():
        target = stage / name
        target.mkdir(parents=True, exist_ok=True)
        (target / 'index.js').write_text(source)
        if name == 'catalog-feed':
            shutil.copytree(root / name / 'snapshots', target / 'snapshots')

    had_destination = destination.exists()
    if had_destination:
        os.replace(destination, backup)
    try:
        os.replace(stage, destination)
    except BaseException:
        if had_destination and backup.exists() and not destination.exists():
            os.replace(backup, destination)
        raise
    if had_destination:
        shutil.rmtree(backup)
finally:
    if stage.exists():
        shutil.rmtree(stage)
print(f'Composed {len(names)} handlers; original mini-program functions unchanged.')
