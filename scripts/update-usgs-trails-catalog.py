#!/usr/bin/env python3
"""Collect USGS public-domain hiking trail references for discovery only.

The USGS dataset aggregates federal, state, local and partner records. It is
not an opening-status feed; every row remains 待核验 and geometry is simplified
for map context, never treated as a navigation track.
"""
import concurrent.futures
import datetime as dt
import json
import math
import os
from pathlib import Path
import tempfile
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'shared/data/catalog/usgs-trails.json'
BASE = 'https://partnerships.nationalmap.gov/arcgis/rest/services/USGSTrails/MapServer/0'
DATASET_URL = 'https://www.usgs.gov/national-digital-trails/usgs-trails-explorer'
LICENSE_URL = 'https://www.usgs.gov/national-digital-trails/how-access-or-view-usgs-trails-dataset'
ATTRIBUTION = ('U.S. Geological Survey National Digital Trails. USGS public-domain aggregate; '
               'the original source originator is retained for each record.')
WHERE = "hikerpedestrian = 'Y' AND trailtype = 'Terra Trail' AND name IS NOT NULL"
FIELDS = ('OBJECTID,permanentidentifier,name,sourceoriginator,trailtype,hikerpedestrian,'
          'nationaltraildesignation,lengthmiles,seasonopen,publisheddate,sourceeditdate,routetype')
PAGE_SIZE = 500
MAX_FEATURES = 150_000
MAX_BODY = 18_000_000
MAX_POINTS = 200
MAX_LINE_POINTS = 40


def request(params):
    url = BASE + '/query?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        'User-Agent': 'HikingEarth/0.2 (+https://github.com/hiking-earth/clients)',
        'Accept': 'application/json',
    })
    with urllib.request.urlopen(req, timeout=45) as response:
        parsed = urllib.parse.urlparse(response.url)
        if parsed.scheme != 'https' or parsed.hostname != 'partnerships.nationalmap.gov' or parsed.port or parsed.username or parsed.password:
            raise ValueError('unexpected USGS service redirect')
        body = response.read(MAX_BODY + 1)
    if len(body) > MAX_BODY:
        raise ValueError('USGS response exceeds the per-page size budget')
    value = json.loads(body)
    if not isinstance(value, dict) or 'error' in value:
        raise ValueError('USGS trail query failed')
    return value


def clean(value, limit=300):
    if value is None:
        return None
    if isinstance(value, bool):
        return 'true' if value else 'false'
    text = ' '.join(str(value).replace('\x00', ' ').split()).strip()
    return text[:limit] or None


def simplify(raw):
    if not isinstance(raw, list) or len(raw) < 2:
        raise ValueError('line has fewer than two vertices')
    points = []
    for point in raw:
        if (not isinstance(point, list) or len(point) < 2
                or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in point[:2])
                or not -180 <= point[0] <= 180 or not -90 <= point[1] <= 90):
            raise ValueError('geometry is not finite WGS84')
        points.append([round(point[0], 5), round(point[1], 5)])
    stride = max(1, math.ceil(len(points) / MAX_LINE_POINTS))
    reduced = points[::stride]
    if reduced[-1] != points[-1]:
        reduced.append(points[-1])
    return reduced


def fetch_batch(batch):
    result = request({
        'objectIds': ','.join(map(str, batch)), 'outFields': FIELDS,
        'returnGeometry': 'true', 'outSR': '4326', 'maxAllowableOffset': '0.0002',
        'geometryPrecision': '5', 'f': 'json',
    })
    features = result.get('features')
    if not isinstance(features, list) or len(features) != len(batch):
        raise ValueError('USGS result batch is incomplete')
    return batch, features


def collect():
    identity = request({'where': WHERE, 'returnIdsOnly': 'true', 'f': 'json'})
    ids = identity.get('objectIds')
    if not isinstance(ids, list) or not ids or len(ids) > MAX_FEATURES:
        raise ValueError('USGS hiking feature count is empty or above the safety limit')
    if any(isinstance(value, bool) or not isinstance(value, int) or value <= 0 for value in ids) or len(set(ids)) != len(ids):
        raise ValueError('USGS object IDs are invalid or duplicated')
    ids.sort()
    batches = [ids[i:i + PAGE_SIZE] for i in range(0, len(ids), PAGE_SIZE)]
    collected = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(fetch_batch, batch) for batch in batches]
        for future in concurrent.futures.as_completed(futures):
            batch, features = future.result()
            for feature in features:
                attrs = feature.get('attributes') if isinstance(feature, dict) else None
                object_id = attrs.get('objectid') if isinstance(attrs, dict) else None
                if object_id not in batch or object_id in collected:
                    raise ValueError('USGS response has unexpected or duplicate object IDs')
                if attrs.get('hikerpedestrian') != 'Y' or attrs.get('trailtype') != 'Terra Trail' or not clean(attrs.get('name')):
                    raise ValueError('USGS response no longer matches the approved hiking filter')
                collected[object_id] = feature
            print(f'USGS hiking references {len(collected)} / {len(ids)}', flush=True)
    if set(collected) != set(ids):
        raise ValueError('USGS response did not reconcile with its ID query')

    now = dt.datetime.now(dt.timezone.utc).isoformat()
    routes, withheld = [], {}
    for object_id in ids:
        feature = collected[object_id]
        attrs = feature['attributes']
        source_object_id = attrs.get('objectid')
        permanent_id = clean(attrs.get('permanentidentifier'), 120)
        if isinstance(source_object_id, bool) or not isinstance(source_object_id, int) or source_object_id <= 0:
            raise ValueError('USGS source object IDs are missing or invalid')
        geometry = feature.get('geometry')
        paths = geometry.get('paths') if isinstance(geometry, dict) else None
        if not isinstance(paths, list) or not paths or len(paths) > 50:
            withheld['unsupported-geometry'] = withheld.get('unsupported-geometry', 0) + 1
            continue
        try:
            lines = [simplify(path) for path in paths]
        except ValueError:
            withheld['invalid-line-geometry'] = withheld.get('invalid-line-geometry', 0) + 1
            continue
        points = [point for line in lines for point in line]
        if len(points) > MAX_POINTS:
            withheld['geometry-over-budget'] = withheld.get('geometry-over-budget', 0) + 1
            continue
        origin = clean(attrs.get('sourceoriginator'), 240)
        name = clean(attrs.get('name'), 160)
        routes.append({
            # The source permanent identifier is not unique across all trail
            # segments. Use the layer's unique OBJECTID and keep both IDs.
            'id': f'usgs-trail-{source_object_id}', 'name': name,
            'region': '美国·USGS全国步道汇总',
            'center': [round(sum(p[i] for p in points) / len(points), 5) for i in (0, 1)],
            'status': '待核验', 'sourceUrl': BASE, 'fetchedAt': now,
            'sourceTags': {
                'sourceOriginator': origin,
                'sourceObjectId': str(source_object_id),
                'sourcePermanentIdentifier': permanent_id,
                'trailType': clean(attrs.get('trailtype')),
                'hikerPedestrian': clean(attrs.get('hikerpedestrian')),
                'nationalTrailDesignation': clean(attrs.get('nationaltraildesignation')),
                'lengthMiles': clean(attrs.get('lengthmiles')),
                'seasonOpen': clean(attrs.get('seasonopen')),
                'sourcePublishedAt': clean(attrs.get('publisheddate')),
                'sourceEditedAt': clean(attrs.get('sourceeditdate')),
                'routeType': clean(attrs.get('routetype')),
            },
            'referencePaths': lines,
        })
    if len(routes) + sum(withheld.values()) != len(ids):
        raise ValueError('USGS records do not reconcile; previous catalog retained')
    routes.sort(key=lambda row: row['id'])
    return {
        'schemaVersion': 1, 'generatedAt': now, 'sourceUrl': BASE,
        'datasetUrl': DATASET_URL, 'license': 'USGS public-domain aggregate; source originator retained',
        'attribution': ATTRIBUTION, 'licenseUrl': LICENSE_URL,
        'sourceFeatureCount': len(ids), 'catalogRouteCount': len(routes),
        'withheldRecords': sum(withheld.values()), 'withheldReasons': withheld,
        'routeStatusPolicy': ('USGS aggregates public-domain records from federal, state, local, and partner sources. '
            'Coverage and freshness vary by source; the dataset can lag its originator. All records remain 待核验. '
            'A hiking-use label and simplified reference geometry do not establish current access, opening status, '
            'route completeness, permission, or navigation suitability. Check the named originator before travel.'),
        'routes': routes,
    }


def main():
    result = collect()
    payload = (json.dumps(result, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode()
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=TARGET.parent, prefix=TARGET.name + '.', suffix='.tmp', delete=False) as handle:
        handle.write(payload)
        temporary = Path(handle.name)
    os.replace(temporary, TARGET)
    print(f"USGS hiking references: {len(result['routes'])}/{result['sourceFeatureCount']}; withheld={result['withheldRecords']}")


if __name__ == '__main__':
    main()
