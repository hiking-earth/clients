#!/usr/bin/env python3
"""Deploy source with logged-in CloudBase CLI; preserve prior remote code.
Not a business test. Stops at first failure and never prints credentials.
"""
import argparse
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--cloudbase-cli', required=True)
parser.add_argument('--node', default='node')
parser.add_argument('--env', default='cloud1-d9g4fl3fu2491914f')
parser.add_argument('--backup-dir', required=True)
parser.add_argument('--functions', nargs='+', default=[
    'client-api', 'social-manage', 'route-manage', 'catalog-feed', 'data-maintenance'
])
args = parser.parse_args()
base = [args.node, args.cloudbase_cli]


def run(command):
    return subprocess.run(command, cwd=ROOT / 'app', capture_output=True, text=True)


def source_files(folder):
    return [path for path in folder.rglob('*')
            if path.is_file() and not {'node_modules', '.git'}.intersection(path.relative_to(folder).parts)]


subprocess.run(['python3', str(ROOT / 'app/scripts/compose-client-api.py')], check=True)
backup = pathlib.Path(args.backup_dir).expanduser().resolve()
backup.mkdir(parents=True, exist_ok=False)
os.chmod(backup, 0o700)
allowed = {folder.name for folder in (ROOT / 'app/cloudfunctions').iterdir() if folder.is_dir()}
if len(args.functions) != len(set(args.functions)):
    raise SystemExit('Duplicate function names are not allowed')
for name in args.functions:
    if name not in allowed or name == 'init-db':
        raise SystemExit('Unknown or provisioning-only function: ' + name)

# Freeze all local deployment sources before touching the remote environment.
sources = {}
for name in args.functions:
    source = backup / 'sent-source' / name
    shutil.copytree(ROOT / 'app/cloudfunctions' / name, source,
                    ignore=shutil.ignore_patterns('node_modules', '.git'))
    sources[name] = source

# Resolve existing versus new functions from the structured function listing;
# a failed download must never be mistaken for a missing function.
remote_names = set()
offset = 0
page_size = 100
while True:
    result = run(base + ['fn', 'list', '-l', str(page_size), '-o', str(offset), '-e', args.env, '--json'])
    diagnostic = backup / ('function-list-' + str(offset) + '.log')
    diagnostic.write_text(result.stdout + '\n' + result.stderr)
    os.chmod(diagnostic, 0o600)
    if result.returncode:
        raise SystemExit('Could not list remote functions; no functions were updated. Private diagnostic retained.')
    try:
        page = json.loads(result.stdout)['data']
        if not isinstance(page, list) or any(not isinstance(row, dict) for row in page):
            raise ValueError('unexpected function listing')
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise SystemExit('Could not parse remote function listing; no functions were updated. Private diagnostic retained.')
    remote_names.update(row.get('FunctionName') or row.get('name') for row in page)
    if len(page) < page_size:
        break
    offset += page_size

missing = sorted(set(args.functions) - remote_names)
config = json.loads((ROOT / 'app/cloudbaserc.json').read_text())
configured = {item['name'] for item in config.get('functions', []) if isinstance(item, dict) and 'name' in item}
if not set(missing).issubset(configured):
    raise SystemExit('A new function has no CloudBase configuration; no functions were updated.')
(backup / 'new-functions.json').write_text(json.dumps(missing, ensure_ascii=False, indent=2) + '\n')

# Complete every existing-function backup first. A CLI outage or permission
# problem must stop the batch before any function code is changed.
for name in args.functions:
    if name not in remote_names:
        continue
    result = run(base + ['fn', 'code', 'download', name, str(backup / name), '-e', args.env, '--json'])
    diagnostic = backup / (name + '-backup.log')
    diagnostic.write_text(result.stdout + '\n' + result.stderr)
    os.chmod(diagnostic, 0o600)
    if result.returncode:
        raise SystemExit('Backup failed for ' + name + '; no functions were updated. Private diagnostic retained.')

for name in args.functions:
    source = sources[name]
    if name in remote_names:
        command = base + ['fn', 'code', 'update', name, '--dir', str(source), '-e', args.env, '--json']
    else:
        command = base + ['fn', 'deploy', name, '--dir', str(source), '-e', args.env,
                          '--install-dependency', 'true', '--yes', '--json']
    result = run(command)
    diagnostic = backup / (name + '-deploy.log')
    diagnostic.write_text(result.stdout + '\n' + result.stderr)
    os.chmod(diagnostic, 0o600)
    if result.returncode:
        message = 'Source deployment failed for ' + name
        if name not in remote_names:
            message += '; it was not present before this run and may require inspection in CloudBase.'
        else:
            message += '; prior code backups are in the private backup directory.'
        raise SystemExit(message)

    for attempt in range(3):
        readback = backup / (name + '-readback-' + str(attempt + 1))
        result = run(base + ['fn', 'code', 'download', name, str(readback), '-e', args.env, '--json'])
        diagnostic = backup / (name + '-readback-' + str(attempt + 1) + '.log')
        diagnostic.write_text(result.stdout + '\n' + result.stderr)
        os.chmod(diagnostic, 0o600)
        if not result.returncode:
            break
        if attempt < 2:
            time.sleep(5 * (attempt + 1))
    if result.returncode:
        raise SystemExit('Remote source readback failed for ' + name + '; private diagnostic retained.')

    for file in source_files(source):
        relative = file.relative_to(source)
        expected = hashlib.sha256(file.read_bytes()).digest()
        matches = [candidate for candidate in readback.rglob(relative.name)
                   if candidate.is_file() and candidate.relative_to(readback).as_posix().endswith(relative.as_posix())]
        if not any(hashlib.sha256(candidate.read_bytes()).digest() == expected for candidate in matches):
            raise SystemExit('Remote content mismatch for ' + name + '/' + relative.as_posix())
    prior = backup / name if name in remote_names else 'new function'
    print('Deployed and remote files verified:', name, 'Prior version:', prior, flush=True)

print('Deployment commands succeeded; verify remote file hashes and perform unified acceptance separately.')
