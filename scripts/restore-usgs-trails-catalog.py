#!/usr/bin/env python3
"""Reconstruct the ignored USGS working catalog from its published pages."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / 'shared/public-catalog/usgs-trails'
TARGET = ROOT / 'shared/data/catalog/usgs-trails.json'


def main():
    manifest_path = FOLDER / 'manifest.json'
    if not manifest_path.exists():
        print('No published USGS snapshot yet; collector will bootstrap it when due.')
        return
    manifest = json.loads(manifest_path.read_bytes())
    if (manifest.get('schemaVersion') != 1 or manifest.get('key') != 'routes'
            or manifest.get('pageSize') != 400 or not isinstance(manifest.get('pages'), list)
            or not isinstance(manifest.get('total'), int)
            or not isinstance(manifest.get('metadata'), dict)
            or not isinstance(manifest.get('snapshot'), str)
            or re.fullmatch(r'[a-f0-9]{64}', manifest['snapshot']) is None
            or len(manifest['pages']) != max(1, (manifest['total'] + 399) // 400)
            or any(not isinstance(digest, str) or re.fullmatch(r'[a-f0-9]{64}', digest) is None for digest in manifest['pages'])):
        raise ValueError('USGS published manifest is invalid; previous source data retained')
    rows = []
    for index, expected in enumerate(manifest['pages']):
        path = FOLDER / manifest['snapshot'] / f'page-{index:05d}.json.gz'
        payload = gzip.decompress(path.read_bytes())
        if hashlib.sha256(payload).hexdigest() != expected:
            raise ValueError(f'USGS published page {index} failed hash verification')
        page = json.loads(payload)
        expected_count = max(0, min(400, manifest['total'] - index * 400))
        if not isinstance(page, list) or len(page) != expected_count:
            raise ValueError(f'USGS published page {index} has an invalid record count')
        rows.extend(page)
    if len(rows) != manifest['total']:
        raise ValueError('USGS published pages do not reconcile')
    data = {**manifest['metadata'], 'routes': rows}
    payload = (json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode()
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=TARGET.parent, prefix=TARGET.name + '.', suffix='.tmp', delete=False) as handle:
        handle.write(payload)
        temporary = Path(handle.name)
    os.replace(temporary, TARGET)
    print(f"Restored {len(rows)} USGS records from snapshot {manifest['snapshot'][:12]}; source file remains git-ignored.")


if __name__ == '__main__':
    main()
