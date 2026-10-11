"""Fail-closed validation for automatically published discovery catalogs.

This validates source records and provenance only. It never grants trail access,
turns a discovery row into a navigable route, or substitutes for human review.
"""
from datetime import date, datetime, timezone
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
}
PENDING_STATUS = '待核验'


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


def validate_route_catalog(source, data):
    """Validate one OSM, USFS, or Hong Kong discovery catalog."""
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
    if source == 'nzdoc' and expected_source_url != 'https://services1.arcgis.com/3JjYDyG3oajxU6HO/ArcGIS/rest/services/DOC_Walking_Experiences/FeatureServer/1':
        raise ValueError('nzdoc: catalog source URL differs from the approved DOC layer')
    if source == 'parkscanada' and expected_source_url != 'https://services2.arcgis.com/wCOMu5IS7YdSyPNx/arcgis/rest/services/vw_Trails_Sentiers_APCA_V2_FGP/FeatureServer/0':
        raise ValueError('parkscanada: catalog source URL differs from the approved Parks Canada layer')
    expected_provenance = {
        'osm': ('ODbL-1.0', '© OpenStreetMap contributors', 'https://www.openstreetmap.org/copyright'),
        'usfs': ('USDA source terms; retain attribution and source metadata', 'USDA Forest Service', 'https://data.fs.usda.gov/geodata/edw/datasets.php?xmlKeyword=recreation'),
        'hk': ('DATA.GOV.HK-terms-1.2', '香港特别行政区政府 · 渔农自然护理署 · DATA.GOV.HK', 'https://data.gov.hk/en/terms-and-conditions'),
        'nzdoc': ('CC-BY-3.0-NZ', None, 'https://www.doc.govt.nz/our-work/maps-and-data/terms-and-conditions/'),
        'parkscanada': ('Open Government Licence - Canada', 'Contains information licensed under the Open Government Licence – Canada. Source: Parks Canada (Trails APCA).', 'https://open.canada.ca/en/open-government-licence-canada/'),
    }[source]
    actual_provenance = tuple(data.get(field) for field in ('license', 'attribution', 'licenseUrl'))
    provenance_matches = actual_provenance == expected_provenance
    if source == 'nzdoc':
        provenance_matches = (actual_provenance[0] == expected_provenance[0]
                              and isinstance(actual_provenance[1], str)
                              and re.fullmatch(r'Crown Copyright: Department of Conservation Te Papa Atawhai [0-9]{4}', actual_provenance[1]) is not None
                              and actual_provenance[2] == expected_provenance[2])
    if not provenance_matches:
        raise ValueError(f'{source}: catalog attribution or license metadata differs from the approved source policy')
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
        _timestamp(row.get('fetchedAt'), label)
        # These files are discovery feeds. An access/open status must come from
        # the separately reviewed official route-status workflow.
        status = row.get('status')
        if status not in (None, PENDING_STATUS):
            raise ValueError(f'{label}: discovery catalog cannot publish status {status!r}')
        if source in ('hk', 'nzdoc', 'parkscanada'):
            _reference_paths(row.get('referencePaths'), label)
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
    today = (now or datetime.now(timezone.utc)).date()
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
        if acceptance is not None and acceptance != 'accepted':
            raise ValueError(f'{label}: source {row["sourceId"]} feed has not been accepted')
        if acceptance == 'accepted':
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
