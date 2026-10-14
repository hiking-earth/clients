"""Fail-closed validation for automatically published discovery catalogs.

This validates source records and provenance only. It never grants trail access,
turns a discovery row into a navigable route, or substitutes for human review.
"""
from datetime import date, datetime, timedelta, timezone
import re
from urllib.parse import urlparse


DISCOVERY_IDS = {
    'osm': re.compile(r'^osm-relation-[1-9][0-9]*$'),
    # USDA's official trail_cn may be either an integer or a dotted trail
    # number (for example 5022.010011). Preserve that source identity exactly.
    'usfs': re.compile(r'^usfs-[1-9][0-9]*(?:\.[0-9]+)?$'),
    'hk': re.compile(r'^hk-afcd-[1-9][0-9]*$'),
    'nzdoc': re.compile(r'^nzdoc-[1-9][0-9]*$'),
    'parkscanada': re.compile(r'^parkscanada-[1-9][0-9]*$'),
    'nsw-npws': re.compile(r'^nsw-npws-[1-9][0-9]*$'),
    'england': re.compile(r'^england-trail-[1-9][0-9]*$'),
    'wales': re.compile(r'^wales-trail-[1-9][0-9]*$'),
    'scotland-argyll': re.compile(r'^scotland-argyll-[1-9][0-9]*$'),
    'ni-midulster': re.compile(r'^ni-midulster-[1-9][0-9]*$'),
    'norfolk-prow': re.compile(r'^norfolk-prow-[1-9][0-9]*$'),
    'cambridgeshire-prow': re.compile(r'^cambridgeshire-prow-[1-9][0-9]*$'),
    'nps-public-trails': re.compile(r'^nps-trail-[1-9][0-9]*$'),
    'usgs-trails': re.compile(r'^usgs-trail-[A-Za-z0-9._-]{1,120}$'),
    'victoria-recreation-tracks': re.compile(r'^vic-recreation-track-[A-Za-z0-9._-]{1,80}$'),
}
PENDING_STATUS = '待核验'
APPROVED_SOURCE_ENDPOINTS = {
    'usfs': 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublishWithDataStatus_01/MapServer/0',
    'hk': 'https://portal.csdi.gov.hk/server/rest/services/common/afcd_rcd_1665568199103_4360/FeatureServer/0',
    'nps-public-trails': 'https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails/FeatureServer/0',
    'usgs-trails': 'https://partnerships.nationalmap.gov/arcgis/rest/services/USGSTrails/MapServer/0',
    'victoria-recreation-tracks': 'https://opendata.maps.vic.gov.au/geoserver/wfs',
}
OSM_REFRESH_COUNT_REGIONS = frozenset({
    'asia', 'china', 'europe', 'north-america', 'japan', 'oceania',
    'south-america', 'africa', 'south-asia', 'hong-kong', 'macao',
})


def _validate_osm_refresh_counts(data):
    """Keep incremental result counts distinct from total route coverage."""
    legacy = data.get('coverage')
    current = data.get('lastRefreshCounts')
    for field, counts in (('coverage', legacy), ('lastRefreshCounts', current)):
        if counts is None:
            continue
        if not isinstance(counts, dict):
            raise ValueError(f'osm: {field} must be a region-to-count object')
        for region, count in counts.items():
            if (region not in OSM_REFRESH_COUNT_REGIONS
                    or isinstance(count, bool) or not isinstance(count, int) or count < 0):
                raise ValueError(f'osm: invalid {field} entry for {region!r}')
    if isinstance(legacy, dict) and isinstance(current, dict) and legacy != current:
        raise ValueError('osm: legacy coverage and lastRefreshCounts must match during compatibility period')


def _https_host(value, label):
    if not isinstance(value, str):
        raise ValueError(f'{label}: missing URL')
    parsed = urlparse(value)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port:
        raise ValueError(f'{label}: URL must be HTTPS without credentials or an explicit port')
    return parsed.hostname.lower().rstrip('.')


def _timestamp(value, label):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'{label}: missing timestamp')
    try:
        parsed = datetime.fromisoformat(value.strip().replace('Z', '+00:00'))
    except ValueError as error:
        raise ValueError(f'{label}: invalid ISO-8601 timestamp') from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f'{label}: timestamp must include a timezone')
    return parsed


def _center(value, label):
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError(f'{label}: center must be [longitude, latitude]')
    lon, lat = value
    if (isinstance(lon, bool) or isinstance(lat, bool)
            or not isinstance(lon, (int, float)) or not isinstance(lat, (int, float))
            or not -180 <= lon <= 180 or not -90 <= lat <= 90):
        raise ValueError(f'{label}: center is outside WGS84 bounds')


def _reference_paths(value, label):
    if not isinstance(value, list) or not value:
        raise ValueError(f'{label}: reference paths must be a non-empty list')
    for path_index, path in enumerate(value):
        if not isinstance(path, list) or len(path) < 2:
            raise ValueError(f'{label}: reference path {path_index} needs at least two points')
        for point_index, point in enumerate(path):
            _center(point, f'{label}: reference path {path_index} point {point_index}')


def validate_route_catalog(source, data, now=None):
    """Validate one approved OSM or government trail-discovery catalog."""
    if source not in DISCOVERY_IDS:
        raise ValueError(f'unsupported discovery source: {source}')
    if not isinstance(data, dict) or data.get('schemaVersion') != 1:
        raise ValueError(f'{source}: unsupported catalog schema')
    rows = data.get('routes')
    if not isinstance(rows, list):
        raise ValueError(f'{source}: routes must be a list')
    expected_host = 'www.openstreetmap.org' if source == 'osm' else _https_host(data.get('sourceUrl'), f'{source} catalog source')
    expected_source_url = data.get('sourceUrl')
    if source != 'osm' and not isinstance(expected_source_url, str):
        raise ValueError(f'{source}: catalog source URL is required')
    approved_endpoint = APPROVED_SOURCE_ENDPOINTS.get(source)
    if approved_endpoint and expected_source_url != approved_endpoint:
        raise ValueError(f'{source}: catalog source URL differs from the approved source endpoint')
    if source == 'nzdoc' and expected_source_url != 'https://services1.arcgis.com/3JjYDyG3oajxU6HO/ArcGIS/rest/services/DOC_Walking_Experiences/FeatureServer/1':
        raise ValueError('nzdoc: catalog source URL differs from the approved DOC layer')
    if source == 'parkscanada' and expected_source_url != 'https://services2.arcgis.com/wCOMu5IS7YdSyPNx/arcgis/rest/services/vw_Trails_Sentiers_APCA_V2_FGP/FeatureServer/0':
        raise ValueError('parkscanada: catalog source URL differs from the approved Parks Canada layer')
    if source == 'nsw-npws' and expected_source_url != 'https://services7.arcgis.com/9nlQUywsHzFwAwIM/arcgis/rest/services/NPWS_Tracks/FeatureServer/0':
        raise ValueError('nsw-npws: catalog source URL differs from the approved NSW NPWS layer')
    if source == 'england' and expected_source_url != 'https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/National_Trails_England/FeatureServer/0':
        raise ValueError('england: catalog source URL differs from the approved Natural England layer')
    if source == 'wales' and (not isinstance(expected_source_url, str)
                              or not expected_source_url.startswith('https://datamap.gov.wales/geoserver/ows?')
                              or 'NRW_NATIONAL_TRAIL' not in expected_source_url):
        raise ValueError('wales: catalog source URL differs from the approved Natural Resources Wales WFS layer')
    if source == 'scotland-argyll' and expected_source_url != 'https://arcgis.argyll-bute.gov.uk/arcgis/rest/services/Open_Data/MapServer/27':
        raise ValueError('scotland-argyll: catalog source URL differs from the approved council layer')
    if source == 'ni-midulster' and expected_source_url != 'https://services1.arcgis.com/IBPnlgK2X1Ngocds/arcgis/rest/services/PROW/FeatureServer/0':
        raise ValueError('ni-midulster: catalog source URL differs from the approved Mid Ulster public-rights-of-way layer')
    if source == 'norfolk-prow' and expected_source_url != 'https://maps.norfolk.gov.uk/arcgis/rest/services/layers_ext/highways/MapServer/2':
        raise ValueError('norfolk-prow: catalog source URL differs from the approved Norfolk County Council layer')
    if source == 'cambridgeshire-prow' and expected_source_url != 'https://maps.cambridgeshire.gov.uk/GetOWS.ashx?SERVICE=WFS&VERSION=2.0.0&MAPSOURCE=CCC%2FINSPIRE&REQUEST=GetFeature&TYPENAME=public_rights_of_way&OUTPUTFORMAT=GEOJSON&SRSNAME=EPSG%3A4326':
        raise ValueError('cambridgeshire-prow: catalog source URL differs from the approved county WFS layer')
    if source == 'nps-public-trails' and expected_source_url != APPROVED_SOURCE_ENDPOINTS[source]:
        raise ValueError('nps-public-trails: catalog source URL differs from the approved NPS layer')
    expected_provenance = {
        'osm': ('ODbL-1.0', '© OpenStreetMap contributors', 'https://www.openstreetmap.org/copyright'),
        'usfs': ('USDA source terms; retain attribution and source metadata', 'USDA Forest Service', 'https://data.fs.usda.gov/geodata/edw/datasets.php?xmlKeyword=recreation'),
        'hk': ('DATA.GOV.HK-terms-1.2', '香港特别行政区政府 · 渔农自然护理署 · DATA.GOV.HK', 'https://data.gov.hk/en/terms-and-conditions'),
        'nzdoc': ('CC-BY-3.0-NZ', None, 'https://www.doc.govt.nz/our-work/maps-and-data/terms-and-conditions/'),
        'parkscanada': ('Open Government Licence - Canada', 'Contains information licensed under the Open Government Licence – Canada. Source: Parks Canada (Trails APCA).', 'https://open.canada.ca/en/open-government-licence-canada/'),
        'nsw-npws': ('Creative Commons Attribution', '© State Government of NSW and NSW Department of Climate Change, Energy, the Environment and Water 2017. Source: NSW NPWS Asset Infrastructure – Track Section.', 'https://data.nsw.gov.au/data/dataset/asset-infrastructure-track-section8bfcf'),
        'england': ('Open Government Licence v3.0', None, 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'),
        'wales': ('Open Government Licence for Public Sector Information (OGL)', 'Contains Natural Resources Wales information © Natural Resources Wales and Database Right. All rights Reserved. Contains Ordnance Survey Data. Ordnance Survey Licence number AC0000849444. Crown Copyright and Database Right.', 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'),
        'scotland-argyll': ('Open Government Licence v3.0', 'Contains spatial data licensed under Open Government Licence v3.0 from Argyll and Bute Council. Source: Adopted Core Paths.', 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'),
        'ni-midulster': ('Open Government Licence v3.0', 'Contains information licensed under the Open Government Licence v3.0 from OpenDataNI and Mid Ulster District Council. Source: Public Rights of Way.', 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'),
        'norfolk-prow': ('Open Government Licence v3.0; data.gov.uk lists Creative Commons Attribution', 'Contains Norfolk County Council Public Rights of Way data. © Norfolk County Council and © Crown copyright and database rights 2019 Ordnance Survey 100019340. Licensed under Open Government Licence v3.0; source metadata also lists Creative Commons Attribution.', 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'),
        'cambridgeshire-prow': ('Open Government Licence v3.0', 'Contains information licensed under the Open Government Licence v3.0 from Cambridgeshire County Council. Source: Public Rights of Way.', 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'),
        'nps-public-trails': ('U.S. federal public-distribution dataset; no named layer-specific license', 'U.S. National Park Service, Public Trails dataset. NPS public-distribution data; no named layer-specific license. See source and NPS data disclaimer.', 'https://www.nps.gov/subjects/gisandmapping/data-disclaimers.htm'),
        'usgs-trails': ('USGS public-domain aggregate; source originator retained', 'U.S. Geological Survey National Digital Trails. USGS public-domain aggregate; the original source originator is retained for each record.', 'https://www.usgs.gov/national-digital-trails/how-access-or-view-usgs-trails-dataset'),
        'victoria-recreation-tracks': ('Creative Commons Attribution 4.0 International', 'Contains Victorian Government data from Recreation Tracks, Department of Energy, Environment and Climate Action. Licensed under CC BY 4.0.', 'https://creativecommons.org/licenses/by/4.0/'),
    }[source]
    actual_provenance = tuple(data.get(field) for field in ('license', 'attribution', 'licenseUrl'))
    provenance_matches = actual_provenance == expected_provenance
    if source == 'nzdoc':
        provenance_matches = (actual_provenance[0] == expected_provenance[0]
                              and isinstance(actual_provenance[1], str)
                              and re.fullmatch(r'Crown Copyright: Department of Conservation Te Papa Atawhai [0-9]{4}', actual_provenance[1]) is not None
                              and actual_provenance[2] == expected_provenance[2])
    if source == 'england':
        provenance_matches = (actual_provenance[0] == expected_provenance[0]
                              and isinstance(actual_provenance[1], str)
                              and re.fullmatch(r'© Natural England copyright\. Contains Ordnance Survey data © Crown copyright and database right [0-9]{4}\.', actual_provenance[1]) is not None
                              and actual_provenance[2] == expected_provenance[2])
    if not provenance_matches:
        raise ValueError(f'{source}: catalog attribution or license metadata differs from the approved source policy')
    if source == 'nps-public-trails':
        source_total = data.get('sourceFeatureCount')
        catalog_total = data.get('catalogRouteCount')
        withheld = data.get('withheldRecords')
        reasons = data.get('withheldReasons')
        if (isinstance(source_total, bool) or not isinstance(source_total, int) or source_total > 50000
                or isinstance(catalog_total, bool) or not isinstance(catalog_total, int) or catalog_total != len(rows)
                or isinstance(withheld, bool) or not isinstance(withheld, int) or withheld < 0):
            raise ValueError('nps-public-trails: source and withheld record counts are invalid')
        if source_total != catalog_total + withheld:
            raise ValueError('nps-public-trails: source and catalog counts do not reconcile')
        if (not isinstance(reasons, dict)
                or any(not isinstance(key, str) or isinstance(value, bool) or not isinstance(value, int) or value < 0 for key, value in reasons.items())
                or sum(reasons.values()) != withheld):
            raise ValueError('nps-public-trails: withheld record reasons do not reconcile')
        policy = data.get('routeStatusPolicy')
        if not isinstance(policy, str) or len(policy) > 1200:
            raise ValueError('nps-public-trails: route disclaimer is missing or too long')
    if source == 'usgs-trails':
        source_total, catalog_total = data.get('sourceFeatureCount'), data.get('catalogRouteCount')
        withheld, reasons = data.get('withheldRecords'), data.get('withheldReasons')
        if (isinstance(source_total, bool) or not isinstance(source_total, int) or not 0 < source_total <= 150000
                or isinstance(catalog_total, bool) or not isinstance(catalog_total, int) or catalog_total != len(rows)
                or isinstance(withheld, bool) or not isinstance(withheld, int) or withheld < 0
                or source_total != catalog_total + withheld):
            raise ValueError('usgs-trails: source and catalog counts do not reconcile')
        if (not isinstance(reasons, dict)
                or any(not isinstance(key, str) or isinstance(value, bool) or not isinstance(value, int) or value < 0 for key, value in reasons.items())
                or sum(reasons.values()) != withheld):
            raise ValueError('usgs-trails: withheld record reasons do not reconcile')
        policy = data.get('routeStatusPolicy')
        if not isinstance(policy, str) or len(policy) > 1200:
            raise ValueError('usgs-trails: route disclaimer is missing or too long')
    if source == 'victoria-recreation-tracks':
        source_total, catalog_total = data.get('sourceFeatureCount'), data.get('catalogRouteCount')
        withheld, excluded, reasons = data.get('withheldRecords'), data.get('excludedNonWalkingRecords'), data.get('withheldReasons')
        if (isinstance(source_total, bool) or not isinstance(source_total, int) or not 0 < source_total <= 2000
                or isinstance(catalog_total, bool) or not isinstance(catalog_total, int) or catalog_total != len(rows)
                or isinstance(withheld, bool) or not isinstance(withheld, int) or withheld < 0
                or isinstance(excluded, bool) or not isinstance(excluded, int) or excluded < 0
                or source_total != catalog_total + withheld):
            raise ValueError('victoria-recreation-tracks: source counts do not reconcile')
        if (not isinstance(reasons, dict)
                or any(not isinstance(key, str) or isinstance(value, bool) or not isinstance(value, int) or value < 0 for key, value in reasons.items())
                or sum(reasons.values()) != withheld):
            raise ValueError('victoria-recreation-tracks: withheld reasons do not reconcile')
        policy = data.get('routeStatusPolicy')
        if not isinstance(policy, str) or len(policy) > 1200:
            raise ValueError('victoria-recreation-tracks: route disclaimer is missing or too long')
    if source == 'osm':
        _validate_osm_refresh_counts(data)
    now = now or datetime.now(timezone.utc)
    generated_at = _timestamp(data.get('generatedAt'), f'{source} catalog')
    if generated_at > now + timedelta(minutes=5):
        raise ValueError(f'{source}: catalog generatedAt is in the future')
    seen = set()
    for index, row in enumerate(rows):
        label = f'{source} route[{index}]'
        if not isinstance(row, dict):
            raise ValueError(f'{label}: record must be an object')
        identity = row.get('id')
        if not isinstance(identity, str) or not DISCOVERY_IDS[source].fullmatch(identity):
            raise ValueError(f'{label}: invalid source record ID')
        if identity in seen:
            raise ValueError(f'{label}: duplicate source record ID {identity}')
        seen.add(identity)
        for field in ('name', 'region'):
            if not isinstance(row.get(field), str) or not row[field].strip():
                raise ValueError(f'{label}: {field} is required')
        _center(row.get('center'), label)
        row_source = row.get('sourceUrl')
        if _https_host(row_source, label) != expected_host:
            raise ValueError(f'{label}: record source host differs from catalog provenance')
        if source == 'osm':
            if row_source != f'https://www.openstreetmap.org/relation/{identity.removeprefix("osm-relation-")}':
                raise ValueError(f'{label}: relation URL does not match its source ID')
        elif row_source != expected_source_url:
            raise ValueError(f'{label}: record source URL differs from catalog provenance')
        fetched = _timestamp(row.get('fetchedAt'), label)
        if fetched > now + timedelta(minutes=5):
            raise ValueError(f'{label}: fetchedAt is in the future')
        if 'pbfSources' in row:
            pbf_sources = row['pbfSources']
            if (not isinstance(pbf_sources, list)
                    or any(not isinstance(source_id, str)
                           or re.fullmatch(r'[a-z0-9][a-z0-9/_-]{0,99}', source_id) is None
                           for source_id in pbf_sources)
                    or len(set(pbf_sources)) != len(pbf_sources)):
                raise ValueError(f'{label}: invalid PBF source provenance')
        # These files are discovery feeds. An access/open status must come from
        # the separately reviewed official route-status workflow.
        status = row.get('status')
        if status not in (None, PENDING_STATUS):
            raise ValueError(f'{label}: discovery catalog cannot publish status {status!r}')
        if source in ('hk', 'nzdoc', 'parkscanada', 'nsw-npws', 'england', 'wales', 'scotland-argyll', 'ni-midulster', 'norfolk-prow', 'cambridgeshire-prow', 'nps-public-trails', 'usgs-trails', 'victoria-recreation-tracks'):
            _reference_paths(row.get('referencePaths'), label)
        if source == 'nps-public-trails':
            tags = row.get('sourceTags')
            allowed = {'featureId', 'sourceStatus', 'surface', 'trailType', 'trailClass', 'trailUse', 'sourceEditedAt', 'sourceDate'}
            paths = row.get('referencePaths')
            if (not row['region'].startswith('美国·') or not isinstance(tags, dict) or set(tags) != allowed
                    or any(value is not None and (not isinstance(value, str) or len(value) > 300) for value in tags.values())
                    or not isinstance(tags.get('trailUse'), str)
                    or not any(term in tags['trailUse'].lower() for term in ('hiker', 'pedestrian'))
                    or len(paths) > 100 or any(len(path) > 151 for path in paths)):
                raise ValueError(f'{label}: NPS source fields or reference geometry are invalid')
        if source == 'usgs-trails':
            tags = row.get('sourceTags')
            allowed = {'sourceOriginator', 'sourceObjectId', 'sourcePermanentIdentifier', 'trailType', 'hikerPedestrian', 'nationalTrailDesignation', 'lengthMiles',
                       'seasonOpen', 'sourcePublishedAt', 'sourceEditedAt', 'routeType'}
            paths = row.get('referencePaths')
            if (not row['region'].startswith('美国·') or status != PENDING_STATUS
                    or not isinstance(tags, dict) or set(tags) != allowed
                    or tags.get('hikerPedestrian') != 'Y' or tags.get('trailType') != 'Terra Trail'
                    or not isinstance(tags.get('sourceObjectId'), str) or not tags['sourceObjectId'].isdigit()
                    or identity != f"usgs-trail-{tags['sourceObjectId']}"
                    or any(value is not None and (not isinstance(value, str) or len(value) > 300) for value in tags.values())
                    or tags.get('sourceOriginator') is not None and not tags['sourceOriginator'].strip()
                    or len(paths) > 50 or any(len(path) > 151 for path in paths)):
                raise ValueError(f'{label}: USGS source fields or reference geometry are invalid')
        if source == 'victoria-recreation-tracks':
            tags = row.get('sourceTags')
            allowed = {'assetClass','maintainedBy','walkingActivity','walkingComment','walkingGrade','walkingDistance',
                       'walkingDistanceUnit','walkingDuration','walkingDurationUnit','closureStatus','closureReason','sourceEditedAt'}
            if (row.get('region') != '澳大利亚·维多利亚州' or status != PENDING_STATUS
                    or not isinstance(tags, dict) or set(tags) != allowed or tags.get('walkingActivity') != 'Y'
                    or any(value is not None and (not isinstance(value, str) or len(value) > 300) for value in tags.values())
                    or len(row.get('referencePaths', [])) > 100
                    or any(len(path) > 151 for path in row.get('referencePaths', []))):
                raise ValueError(f'{label}: invalid Victorian walking source metadata or geometry budget')
        if source == 'cambridgeshire-prow':
            lon, lat = row['center']
            paths = row['referencePaths']
            if (not -1 <= lon <= 1 or not 51 <= lat <= 53.5
                    or any(not -1 <= point[0] <= 1 or not 51 <= point[1] <= 53.5
                           for path in paths for point in path)):
                raise ValueError(f'{label}: geometry does not fall within the Cambridgeshire source area')
        if source == 'norfolk-prow':
            tags = row.get('sourceTags')
            allowed = {'sourceId', 'pathClass', 'primaryRight', 'parish', 'linkCode', 'section', 'administrativeUnit'}
            if (not isinstance(tags, dict) or set(tags) != allowed
                    or any(value is not None and (not isinstance(value, str) or len(value) > 300) for value in tags.values())
                    or len(row.get('referencePaths', [])) > 100
                    or any(len(path) > 151 for path in row.get('referencePaths', []))):
                raise ValueError(f'{label}: invalid Norfolk route source fields or geometry budget')
        if source == 'cambridgeshire-prow':
            tags = row.get('sourceTags')
            allowed = {'sourceStatus', 'parish', 'pathNumber', 'parishNumber', 'district', 'lengthKm'}
            if (not isinstance(tags, dict) or set(tags) != allowed
                    or any(value is not None and (not isinstance(value, str) or len(value) > 300)
                           for key, value in tags.items() if key != 'lengthKm')
                    or tags.get('lengthKm') is not None
                    and (isinstance(tags['lengthKm'], bool) or not isinstance(tags['lengthKm'], (int, float))
                         or not 0 <= tags['lengthKm'] <= 1000)
                    or len(row.get('referencePaths', [])) > 100
                    or any(len(path) > 151 for path in row.get('referencePaths', []))):
                raise ValueError(f'{label}: invalid Cambridgeshire route source fields or geometry budget')
        if source == 'nzdoc':
            official_url = row.get('sourceTags', {}).get('officialUrl') if isinstance(row.get('sourceTags'), dict) else None
            if official_url is not None and _https_host(official_url, f'{label} official page') != 'www.doc.govt.nz':
                raise ValueError(f'{label}: official page must link to the DOC website')
        if source == 'parkscanada':
            tags = row.get('sourceTags') if isinstance(row.get('sourceTags'), dict) else {}
            for field in ('officialUrlEn', 'officialUrlFr'):
                value = tags.get(field)
                if value is not None and _https_host(value, f'{label} {field}') not in ('pc.gc.ca', 'www.pc.gc.ca', 'parks.canada.ca', 'www.parks.canada.ca'):
                    raise ValueError(f'{label}: official page must link to Parks Canada')
    return len(rows)


def validate_news_catalog(data, now=None):
    """Validate curated metadata-only official-news links and their source hosts."""
    if not isinstance(data, dict) or data.get('schemaVersion') != 1:
        raise ValueError('news: unsupported catalog schema')
    rows = data.get('items')
    sources = data.get('sources')
    if not isinstance(rows, list) or not isinstance(sources, list):
        raise ValueError('news: items and sources must be lists')
    current_time = now or datetime.now(timezone.utc)
    generated_at = _timestamp(data.get('generatedAt'), 'news catalog')
    if generated_at > current_time + timedelta(minutes=5):
        raise ValueError('news: catalog generatedAt is in the future')
    today = current_time.date()
    source_by_id = {}
    for source in sources:
        if not isinstance(source, dict) or not isinstance(source.get('id'), str):
            raise ValueError('news: invalid source definition')
        identity = source['id']
        if identity in source_by_id:
            raise ValueError(f'news: duplicate source definition {identity}')
        hosts = source.get('articleHosts')
        if not isinstance(hosts, list) or not hosts or any(not isinstance(host, str) or not host.strip() for host in hosts):
            raise ValueError(f'news: source {identity} has no explicit article host allowlist')
        source_by_id[identity] = (source, {host.lower().rstrip('.') for host in hosts})
    seen = set()
    for index, row in enumerate(rows):
        label = f'news item[{index}]'
        if not isinstance(row, dict):
            raise ValueError(f'{label}: record must be an object')
        identity = row.get('id')
        if not isinstance(identity, str) or not identity.strip() or identity in seen:
            raise ValueError(f'{label}: missing or duplicate ID')
        seen.add(identity)
        for field in ('title', 'region', 'sourceId', 'sourceLabel'):
            if not isinstance(row.get(field), str) or not row[field].strip():
                raise ValueError(f'{label}: {field} is required')
        if row.get('verified') is not True:
            raise ValueError(f'{label}: only explicitly verified metadata links may be published')
        source_pair = source_by_id.get(row['sourceId'])
        if source_pair is None:
            raise ValueError(f'{label}: unknown source ID')
        source, allowed_hosts = source_pair
        acceptance = source.get('feedAcceptance')
        if acceptance != 'accepted':
            raise ValueError(f'{label}: source {row["sourceId"]} feed has not been accepted')
        try:
            raw_verified_date = source['feedVerifiedAt']
            verified_date = date.fromisoformat(raw_verified_date)
            if not isinstance(raw_verified_date, str) or verified_date.isoformat() != raw_verified_date:
                raise ValueError('non-canonical date')
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError(f'{label}: source {row["sourceId"]} has invalid feed verification date') from error
        if verified_date > today:
            raise ValueError(f'{label}: source {row["sourceId"]} feed verification date is in the future')
        if (today - verified_date).days > 90:
            raise ValueError(f'{label}: source {row["sourceId"]} feed verification has expired')
        article_host = _https_host(row.get('url'), label)
        if article_host not in allowed_hosts:
            raise ValueError(f'{label}: article host is not allowed for source {row["sourceId"]}')
        if _https_host(row.get('sourceUrl'), label) != _https_host(source.get('url'), f'news source {row["sourceId"]}'):
            raise ValueError(f'{label}: feed URL does not match its source definition')
        _timestamp(row.get('publishedAt'), label)
        _timestamp(row.get('fetchedAt'), label)
    return len(rows)
