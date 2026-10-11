#!/usr/bin/env python3
"""Refresh bounded Geofabrik Asia country extracts into the OSM discovery catalog.

Each source is checksum-verified before import. Import failures preserve their
checkpoint/PBF; successful imports stay discovery-only and never infer access.
"""
import argparse
import datetime as dt
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADER = ROOT / 'scripts/download-geofabrik-pbf.py'
IMPORTER = ROOT / 'scripts/import-osm-pbf-catalog.py'
CATALOG = ROOT / 'shared/data/catalog/osm.json'
MAX_SOURCE_BYTES = 700_000_000

# Individual extracts keep peak scratch-space requirements bounded on free
# hosted runners. India and Indonesia use country subregions; their full
# extracts and Russia are too large for this monthly free-runner job.
COUNTRIES = (
    'afghanistan', 'armenia', 'azerbaijan', 'bangladesh', 'bhutan',
    'cambodia', 'east-timor', 'gcc-states', 'iran', 'iraq',
    'israel-and-palestine', 'jordan', 'kazakhstan', 'kyrgyzstan', 'laos',
    'lebanon', 'malaysia-singapore-brunei', 'maldives', 'mongolia', 'myanmar',
    'nepal', 'north-korea', 'pakistan', 'philippines', 'south-korea',
    'sri-lanka', 'syria', 'taiwan', 'tajikistan', 'thailand', 'turkmenistan',
    'uzbekistan', 'vietnam', 'yemen',
)
SOURCES = {slug: f'https://download.geofabrik.de/asia/{slug}-latest.osm.pbf'
           for slug in COUNTRIES}
for zone in ('central-zone', 'eastern-zone', 'north-eastern-zone',
             'northern-zone', 'southern-zone', 'western-zone'):
    SOURCES[f'india/{zone}'] = f'https://download.geofabrik.de/asia/india/{zone}-latest.osm.pbf'
for island in ('kalimantan', 'maluku', 'nusa-tenggara', 'papua', 'sulawesi', 'sumatra'):
    SOURCES[f'indonesia/{island}'] = f'https://download.geofabrik.de/asia/indonesia/{island}-latest.osm.pbf'


def utc_now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def run(command):
    # Stream the long PBF import phases so hosted-runner logs remain live and
    # resumable jobs show their real progress instead of appearing stalled.
    process = subprocess.Popen(command, text=True, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, bufsize=1)
    output = []
    assert process.stdout is not None
    for line in process.stdout:
        output.append(line)
        print(line, end='', flush=True)
    return_code = process.wait()
    if return_code:
        raise RuntimeError(f"command exited {return_code}: {Path(command[1]).name}")
    return ''.join(output)


def catalog_import(source_id):
    data = json.loads(CATALOG.read_text(encoding='utf-8'))
    return next((item for item in data.get('pbfImports', []) if item.get('sourceId') == source_id), None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', action='append', choices=tuple(SOURCES),
                        help='Refresh one source; repeat to select several. Defaults to all bounded sources.')
    parser.add_argument('--downloader-python', default=sys.executable)
    parser.add_argument('--importer-python', default=sys.executable)
    parser.add_argument('--output-dir', type=Path,
                        default=Path(tempfile.gettempdir()) / 'hiking-earth-asian-pbf')
    args = parser.parse_args()
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    selected = args.source or list(SOURCES)
    report = {'schemaVersion': 1, 'startedAt': utc_now(), 'region': 'asia',
              'sourcePage': 'https://download.geofabrik.de/asia.html',
              'sourceLicense': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors',
              'sourceByteCap': MAX_SOURCE_BYTES, 'sources': []}
    failures = 0

    for slug in selected:
        source_id = f'asia/{slug}'
        url = SOURCES[slug]
        source_name = slug.replace('/', '-')
        source_page_area = slug.split('/', 1)[0]
        source_page = f'https://download.geofabrik.de/asia/{source_page_area}.html'
        pbf = output_dir / f'{source_name}-latest.osm.pbf'
        row = {'sourceId': source_id, 'sourceUrl': url, 'sourcePage': source_page,
               'startedAt': utc_now()}
        print(f'\n### {source_id}', flush=True)
        try:
            run([args.downloader_python, str(DOWNLOADER), '--url', url,
                 '--output', str(pbf), '--max-bytes', str(MAX_SOURCE_BYTES),
                 '--workers', '4', '--chunk-mib', '8', '--attempts', '3'])
            imported = catalog_import(source_id)
            # The downloader emits its verified SHA in the final JSON line.
            # Avoid re-reading an unchanged multi-hundred-megabyte PBF.
            if imported and imported.get('sha256'):
                tail = json.loads((pbf.with_name(pbf.name + '.download.json')).read_text(encoding='utf-8'))
                if imported['sha256'] == tail.get('sha256'):
                    row.update({'result': 'unchanged', 'import': imported})
                    report['sources'].append(row)
                    for suffix in ('', '.download.json', '.lock'):
                        candidate = Path(str(pbf) + suffix) if suffix else pbf
                        candidate.unlink(missing_ok=True)
                    continue
            run([args.importer_python, str(IMPORTER), '--pbf', str(pbf), '--region', 'asia',
                 '--source-id', source_id, '--source-url', url])
            row.update({'result': 'imported', 'import': catalog_import(source_id)})
            for suffix in ('', '.download.json', '.lock'):
                candidate = Path(str(pbf) + suffix) if suffix else pbf
                candidate.unlink(missing_ok=True)
        except Exception as error:
            failures += 1
            row.update({'result': 'failed', 'error': str(error),
                        'checkpointPreserved': pbf.with_name(pbf.name + '.download.json').exists()})
            print(f"{source_id} failed; other sources will continue: {error}", file=sys.stderr, flush=True)
        report['sources'].append(row)

    report['completedAt'] = utc_now()
    report['failureCount'] = failures
    report['successCount'] = len(selected) - failures
    report['accessVerified'] = False
    report['note'] = ('Discovery references only. Route opening, legal access, current conditions, '
                      'and navigable geometry require separate evidence and review.')
    report_path = ROOT / 'docs/release' / f'osm-asia-pbf-refresh-{dt.datetime.now(dt.timezone.utc):%Y-%m-%d}.json'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'\nReport: {report_path}', flush=True)
    print(f"Sources succeeded: {report['successCount']}; failed: {failures}", flush=True)
    return 1 if failures == len(selected) else 0


if __name__ == '__main__':
    raise SystemExit(main())
