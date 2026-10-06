#!/usr/bin/env python3
"""Prepare deterministic public catalog pages. No network, build or feature tests.

Raw source files remain the provenance record. Two immutable generations are
retained so an in-flight client can finish reading its original snapshot.
"""
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PAGE_SIZE = 400
SOURCES = {'osm': 'data/catalog/osm.json', 'usfs': 'data/catalog/usfs.json',
           'hk': 'data/catalog/hk-afcd.json', 'news': 'data/content/official-news.json'}


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        handle.write(data)
        temporary = Path(handle.name)
    os.replace(temporary, path)


def prepare():
    # Validate the pair before changing any public pointer or fallback file.
    hk = json.loads((ROOT / 'shared/data/catalog/hk-afcd.json').read_bytes())
    offline_bytes = (ROOT / 'shared/data/offline/hk-afcd.json').read_bytes()
    offline = json.loads(offline_bytes)
    expected_hash = hk.get('offlineSha256')
    if expected_hash is not None and (expected_hash != hashlib.sha256(offline_bytes).hexdigest()
                                    or offline.get('sourceGeneratedAt') != hk.get('generatedAt')):
        raise ValueError('Hong Kong catalog/offline generation mismatch; publication stopped')
    expected = {row['id']: row.get('referencePaths') for row in hk['routes']}
    actual = {}
    for feature in offline.get('geometry', {}).get('features', []):
        identity = feature.get('properties', {}).get('sourceId')
        if identity in actual:
            raise ValueError('Duplicate Hong Kong offline source ID')
        actual[identity] = feature.get('geometry', {}).get('coordinates')
    if expected != actual:
        raise ValueError('Hong Kong catalog/offline reference mismatch; publication stopped')
    for source, relative in SOURCES.items():
        raw = (ROOT / 'shared' / relative).read_bytes()
        data = json.loads(raw)
        key = 'items' if source == 'news' else 'routes'
        rows = data[key]
        if data.get('schemaVersion') != 1 or not isinstance(rows, list) or len(rows) > 250000:
            raise ValueError(f'{source}: unsupported catalog format or source record budget exceeded')
        snapshot = hashlib.sha256(raw).hexdigest()
        folder = ROOT / 'shared/public-catalog' / source
        previous = None
        if (folder / 'manifest.json').exists():
            pointer = json.loads((folder / 'manifest.json').read_bytes())
            previous = pointer.get('snapshot')
            if previous == snapshot:
                previous = pointer.get('previousSnapshot')
        version = folder / snapshot
        hashes = []
        # Even an empty catalog has a valid first page.
        for page in range(max(1, (len(rows) + PAGE_SIZE - 1) // PAGE_SIZE)):
            payload = encode(rows[page * PAGE_SIZE:(page + 1) * PAGE_SIZE])
            if len(payload) > 4 * 1024 * 1024:
                raise ValueError(f'{source}: page exceeds uncompressed memory budget')
            hashes.append(hashlib.sha256(payload).hexdigest())
            compressed = gzip.compress(payload, mtime=0)
            if len(compressed) > 2 * 1024 * 1024:
                raise ValueError(f'{source}: compressed page exceeds download budget')
            atomic_write(version / f'page-{page:05d}.json.gz', compressed)
        index = encode([[str(row.get('name', '')), str(row.get('region', '')), page, offset] for page in range(len(hashes)) for offset, row in enumerate(rows[page * PAGE_SIZE:(page + 1) * PAGE_SIZE])])
        if len(index) > 32 * 1024 * 1024:
            raise ValueError(f'{source}: search index exceeds memory budget')
        packed_index = gzip.compress(index, mtime=0)
        if len(packed_index) > 8 * 1024 * 1024:
            raise ValueError(f'{source}: search index exceeds download budget')
        atomic_write(version / 'index.json.gz', packed_index)
        manifest = encode({'schemaVersion': 1, 'snapshot': snapshot, 'key': key,
                          'total': len(rows), 'pageSize': PAGE_SIZE, 'previousSnapshot': previous,
                          'metadata': {k: v for k, v in data.items() if k not in ('routes', 'items', 'failures')},
                          'pages': hashes, 'indexHash': hashlib.sha256(index).hexdigest()})
        if len(manifest) > 1024 * 1024:
            raise ValueError(f'{source}: manifest exceeds metadata budget')
        atomic_write(version / 'manifest.json', manifest)
        # Pointer is replaced last, only after all immutable page files exist.
        atomic_write(folder / 'manifest.json', manifest)
        retained = {snapshot, previous}
        for child in folder.iterdir():
            if child.is_dir() and len(child.name) == 64 and all(c in '0123456789abcdef' for c in child.name) and child.name not in retained:
                shutil.rmtree(child)
        fallback = ROOT / 'app/cloudfunctions/catalog-feed/snapshots' / source
        fallback.mkdir(parents=True, exist_ok=True)
        for child in fallback.iterdir():
            if child.is_dir() and child.name not in retained:
                shutil.rmtree(child)
        for generation in retained:
            if generation and (folder / generation).is_dir():
                shutil.copytree(folder / generation, fallback / generation, dirs_exist_ok=True)
        atomic_write(fallback / 'manifest.json', manifest)
        # Full raw files remain in shared/data; cloud fallback uses only shards.
        (fallback.parent / (source + '.json')).unlink(missing_ok=True)
        print(f'{source}: prepared {len(rows)} records / {len(hashes)} pages; {snapshot[:12]}')

    for source, relative in {'release': 'releases/stable.json', 'offline-hk': 'data/offline/hk-afcd.json'}.items():
        payload = (ROOT / 'shared' / relative).read_bytes()
        if len(payload) > 16 * 1024 * 1024:
            raise ValueError(f'{source}: direct snapshot exceeds memory budget')
        atomic_write(ROOT / 'app/cloudfunctions/catalog-feed/snapshots' / (source + '.json'), payload)


if __name__ == '__main__':
    prepare()
