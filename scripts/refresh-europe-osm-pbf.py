#!/usr/bin/env python3
"""Refresh bounded Geofabrik Europe country extracts into the OSM discovery catalog.

This is a data collection job, not a route-opening or navigation approval job.
Every imported relation remains pending independent verification.
"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADER = ROOT / 'scripts/download-geofabrik-pbf.py'
IMPORTER = ROOT / 'scripts/import-osm-pbf-catalog.py'
CATALOG = ROOT / 'shared/data/catalog/osm.json'
MAX_SOURCE_BYTES = 900_000_000

# Direct, non-aggregate country/territory extracts only. The overlapping Alps,
# DACH, Britain-and-Ireland, Great Britain and UK aggregates are excluded.
# Czechia, the Netherlands and Poland exceed the free-runner per-file limit.
COUNTRIES = (
    'albania', 'andorra', 'belarus', 'belgium', 'bosnia-herzegovina',
    'bulgaria', 'croatia', 'cyprus', 'denmark', 'estonia', 'faroe-islands',
    'georgia', 'greece', 'guernsey-jersey', 'hungary',
    'ireland-and-northern-ireland', 'isle-of-man', 'kosovo', 'latvia',
    'liechtenstein', 'lithuania', 'luxembourg', 'macedonia', 'malta',
    'moldova', 'monaco', 'montenegro', 'romania', 'serbia', 'slovakia',
    'turkey', 'ukraine',
)
SOURCES = {slug: f'https://download.geofabrik.de/europe/{slug}-latest.osm.pbf'
           for slug in COUNTRIES}


def utc_now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def run(command):
    process = subprocess.Popen(command, text=True, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, bufsize=1)
    output = []
    assert process.stdout is not None
    for line in process.stdout:
        output.append(line)
        print(line, end='', flush=True)
    result = process.wait()
    if result:
        tail = ''.join(output)[-2000:]
        raise RuntimeError(f'command exited {result}: {Path(command[1]).name}\n{tail}')
    return ''.join(output)


def imported_record(source_id):
    data = json.loads(CATALOG.read_text(encoding='utf-8'))
    return next((row for row in data.get('pbfImports', [])
                 if row.get('sourceId') == source_id), None)


def catalog_state():
    raw = CATALOG.read_bytes()
    data = json.loads(raw)
    routes = {row['id']: row for row in data.get('routes', [])}
    return {'sha256': hashlib.sha256(raw).hexdigest(), 'routes': routes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', action='append', choices=tuple(SOURCES),
                        help='Refresh one source; repeat to select several. Defaults to all bounded sources.')
    parser.add_argument('--downloader-python', default=sys.executable)
    parser.add_argument('--importer-python', default=sys.executable)
    parser.add_argument('--output-dir', type=Path,
                        default=Path(tempfile.gettempdir()) / 'hiking-earth-europe-pbf')
    args = parser.parse_args()
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    selected = args.source or list(SOURCES)
    before_catalog = catalog_state()
    report_path = ROOT / 'docs/release' / f'osm-europe-pbf-refresh-{dt.datetime.now(dt.timezone.utc):%Y-%m-%d}.json'
    old_sources, old_runs = [], []
    if report_path.is_file():
        try:
            previous = json.loads(report_path.read_text(encoding='utf-8'))
            if previous.get('schemaVersion') == 1 and previous.get('region') == 'europe':
                old_sources = previous.get('sources', [])
                old_runs = previous.get('runs', [])
                if previous.get('startedAt'):
                    old_runs.append({key: previous.get(key) for key in
                                     ('startedAt', 'completedAt', 'successCount', 'failureCount')})
        except (OSError, json.JSONDecodeError):
            old_sources, old_runs = [], []
    report = {'schemaVersion': 1, 'startedAt': utc_now(), 'region': 'europe',
              'sourcePage': 'https://download.geofabrik.de/europe.html',
              'sourceLicense': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors',
              'sourceByteCap': MAX_SOURCE_BYTES, 'sources': []}
    failures = 0

    for slug in selected:
        source_id, url = f'europe/{slug}', SOURCES[slug]
        pbf = output_dir / f'{slug}-latest.osm.pbf'
        row = {'sourceId': source_id, 'sourceUrl': url,
               'sourcePage': f'https://download.geofabrik.de/europe/{slug}.html',
               'sourceByteCap': MAX_SOURCE_BYTES, 'startedAt': utc_now()}
        print(f'\n### {source_id}', flush=True)
        try:
            run([args.downloader_python, str(DOWNLOADER), '--url', url,
                 '--output', str(pbf), '--max-bytes', str(MAX_SOURCE_BYTES),
                 '--workers', '4', '--chunk-mib', '8', '--attempts', '3'])
            imported = imported_record(source_id)
            checkpoint = pbf.with_name(pbf.name + '.download.json')
            if imported and imported.get('sha256') and checkpoint.is_file():
                check = json.loads(checkpoint.read_text(encoding='utf-8'))
                if imported['sha256'] == check.get('sha256'):
                    row.update({'result': 'unchanged', 'import': imported})
                    report['sources'].append(row)
                    for suffix in ('', '.download.json', '.lock'):
                        (Path(str(pbf) + suffix) if suffix else pbf).unlink(missing_ok=True)
                    continue
            run([args.importer_python, str(IMPORTER), '--pbf', str(pbf),
                 '--region', 'europe', '--source-id', source_id, '--source-url', url])
            row.update({'result': 'imported', 'import': imported_record(source_id)})
            for suffix in ('', '.download.json', '.lock'):
                (Path(str(pbf) + suffix) if suffix else pbf).unlink(missing_ok=True)
        except Exception as error:
            if 'No named hiking/foot route relations with direct way members were found' in str(error):
                row.update({'result': 'empty', 'reason': 'no-named-hiking-relations'})
                for suffix in ('', '.download.json', '.lock'):
                    (Path(str(pbf) + suffix) if suffix else pbf).unlink(missing_ok=True)
                report['sources'].append(row)
                print(f'{source_id} has no named hiking relations; no route record is expected', flush=True)
                continue
            failures += 1
            row.update({'result': 'failed', 'error': str(error),
                        'checkpointPreserved': pbf.with_name(pbf.name + '.download.json').exists()})
            print(f'{source_id} failed; other sources will continue: {error}', file=sys.stderr, flush=True)
        report['sources'].append(row)

    report['completedAt'] = utc_now()
    report['failureCount'] = failures
    report['successCount'] = len(selected) - failures
    report['runs'] = old_runs + [{key: report.get(key) for key in
                                  ('startedAt', 'completedAt', 'successCount', 'failureCount')}]
    report['sources'] = old_sources + report['sources']
    after_catalog = catalog_state()
    before_routes = before_catalog['routes']
    after_routes = after_catalog['routes']
    common = before_routes.keys() & after_routes.keys()
    report['catalogDelta'] = {
        'beforeCount': len(before_routes),
        'afterCount': len(after_routes),
        'addedIds': len(after_routes.keys() - before_routes.keys()),
        'removedIds': len(before_routes.keys() - after_routes.keys()),
        'updatedIds': sum(before_routes[key] != after_routes[key] for key in common),
        'beforeSha256': before_catalog['sha256'],
        'afterSha256': after_catalog['sha256'],
    }
    report['accessVerified'] = False
    report['note'] = ('Discovery references only. Route opening, legal access, current conditions, '
                      'and navigable geometry require separate evidence and review.')
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'\nReport: {report_path}', flush=True)
    print(f"Sources succeeded: {report['successCount']}; failed: {failures}", flush=True)
    return 1 if failures == len(selected) else 0


if __name__ == '__main__':
    raise SystemExit(main())
