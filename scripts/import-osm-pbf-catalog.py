#!/usr/bin/env python3
"""Import named hiking route discoveries from a local, reference-complete OSM PBF.

This adds discovery metadata and a bounds-center only. It does not create a
navigable track or infer opening/access status. Source files are never modified.
"""
import argparse
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import tempfile
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "shared/data/catalog/osm.json"
REGIONS = (
    "china", "hong-kong", "macao", "europe", "north-america", "japan",
    "oceania", "south-america", "africa", "south-asia",
)
TAG_ALLOWLIST = (
    "distance", "ascent", "descent", "network", "operator", "website",
    "description", "access", "ref", "difficulty", "name:zh",
)
MAX_IMPORT_BYTES = 20 * 1024 * 1024 * 1024
MAX_CATALOG_RECORDS = 250_000


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def valid_source_url(value):
    if value is None:
        return True
    try:
        parsed = urlsplit(value)
        return (parsed.scheme == "https" and bool(parsed.hostname) and not parsed.username
                and not parsed.password and parsed.port is None and not parsed.query
                and not parsed.fragment)
    except (TypeError, ValueError):
        return False


def parse_timestamp(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    return parsed if parsed.tzinfo is not None else None


def classify_region(region, lon, lat):
    """Keep PBF imports aligned with the OSM incremental collector labels."""
    if region == "china" and 113.75 <= lon <= 114.55 and 22.05 <= lat <= 22.65:
        return "hong-kong"
    if region == "china" and 113.48 <= lon <= 113.60 and 22.10 <= lat <= 22.26:
        return "macao"
    return region


def valid_catalog(path):
    value = json.loads(path.read_bytes())
    if not isinstance(value, dict) or value.get("schemaVersion") != 1 or not isinstance(value.get("routes"), list):
        raise ValueError("Existing OSM catalog has an unsupported schema; left unchanged")
    identities = set()
    for row in value["routes"]:
        identity = row.get("id") if isinstance(row, dict) else None
        match = re.fullmatch(r"osm-relation-([1-9][0-9]*)", identity) if isinstance(identity, str) else None
        center = row.get("center") if isinstance(row, dict) else None
        tags = row.get("sourceTags") if isinstance(row, dict) else None
        if (not match or identity in identities
                or not isinstance(row.get("name"), str) or not row["name"].strip()
                or not isinstance(row.get("originalName"), str) or not row["originalName"].strip()
                or row.get("region") not in REGIONS
                or not isinstance(center, list) or len(center) != 2
                or any(not isinstance(point, (int, float)) or isinstance(point, bool) or not math.isfinite(point) for point in center)
                or abs(center[0]) > 180 or abs(center[1]) > 90
                or row.get("sourceUrl") != f"https://www.openstreetmap.org/relation/{match.group(1)}"
                or not isinstance(tags, dict) or any(not isinstance(key, str) or not isinstance(tag, str) for key, tag in tags.items())
                or not isinstance(row.get("status"), str) or parse_timestamp(row.get("fetchedAt")) is None
                or ("lastSeenCycle" in row and not isinstance(row["lastSeenCycle"], str))):
            raise ValueError("Existing OSM catalog has an invalid route row; left unchanged")
        identities.add(identity)
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pbf", required=True, type=Path, help="Local .osm.pbf regional extract")
    parser.add_argument("--region", required=True, choices=REGIONS, help="Existing app discovery-region key")
    parser.add_argument("--source-id", required=True, help="Stable extract ID, e.g. china/guangdong")
    parser.add_argument("--source-url", help="Optional HTTPS source URL for the extract")
    parser.add_argument("--catalog", type=Path, default=DEST, help="OSM discovery catalog JSON")
    args = parser.parse_args()

    pbf = args.pbf.expanduser().resolve()
    catalog_path = args.catalog.expanduser().resolve()
    if pbf.suffix.lower() != ".pbf" or not pbf.is_file():
        raise SystemExit("Input must be an existing .osm.pbf file")
    pbf_size = pbf.stat().st_size
    if pbf_size <= 0 or pbf_size > MAX_IMPORT_BYTES:
        raise SystemExit(f"PBF size must be between 1 byte and {MAX_IMPORT_BYTES} bytes")
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    required_free = max(2 * 1024 * 1024 * 1024, pbf_size * 6)
    for volume in {Path(tempfile.gettempdir()), catalog_path.parent}:
        if shutil.disk_usage(volume).free < required_free:
            raise SystemExit(f"Insufficient free space at {volume}; need at least {required_free} bytes for safe PBF processing")
    if not re.fullmatch(r"[a-z0-9][a-z0-9/_-]{0,99}", args.source_id):
        raise SystemExit("--source-id must be a stable lowercase slug using letters, digits, slash, _ or -")
    if args.source_url:
        if not valid_source_url(args.source_url):
            raise SystemExit("--source-url must be HTTPS and cannot contain credentials, a custom port, query parameters, or fragments")

    try:
        import osmium
    except ImportError as exc:
        raise SystemExit("Install the pinned reader dependency: python3 -m pip install -r scripts/requirements-pbf.txt") from exc

    snapshot = valid_catalog(catalog_path) if catalog_path.exists() else {
        "schemaVersion": 1, "routes": [], "license": "ODbL-1.0",
        "attribution": "© OpenStreetMap contributors",
        "licenseUrl": "https://www.openstreetmap.org/copyright",
    }
    imports = snapshot.get("pbfImports", [])
    if not isinstance(imports, list):
        raise SystemExit("Existing PBF import provenance is invalid; catalog left unchanged")
    source_ids = set()
    for item in imports:
        numeric_fields = ("bytes", "candidateRelations", "importedRelations", "skippedIncompleteRelations", "skippedNestedRelations")
        if (not isinstance(item, dict)
                or not isinstance(item.get("sourceId"), str) or not re.fullmatch(r"[a-z0-9][a-z0-9/_-]{0,99}", item["sourceId"])
                or item["sourceId"] in source_ids
                or item.get("region") not in REGIONS or not valid_source_url(item.get("sourceUrl"))
                or (item.get("sourceTimestamp") is not None and parse_timestamp(item.get("sourceTimestamp")) is None)
                or not isinstance(item.get("sha256"), str) or not re.fullmatch(r"[a-f0-9]{64}", item["sha256"])
                or parse_timestamp(item.get("importedAt")) is None
                or any(not isinstance(item.get(field), int) or isinstance(item.get(field), bool) or item[field] < 0 for field in numeric_fields)
                or item["bytes"] <= 0 or item["bytes"] > MAX_IMPORT_BYTES
                or item["importedRelations"] > item["candidateRelations"]
                or item["skippedIncompleteRelations"] > item["candidateRelations"]):
            raise SystemExit("Existing PBF import provenance is invalid; catalog left unchanged")
        source_ids.add(item["sourceId"])
    existing_by_id = {row["id"]: row for row in snapshot["routes"]}
    digest = sha256_file(pbf)
    if any(row.get("sourceId") == args.source_id and row.get("sha256") == digest
           for row in imports if isinstance(row, dict)):
        print(json.dumps({"skipped": "same sourceId and PBF SHA-256 already imported", "sourceId": args.source_id}))
        return
    try:
        replication = osmium.replication.get_replication_header(str(pbf))
        source_time = replication.timestamp
        if source_time and source_time.tzinfo is None:
            source_time = source_time.replace(tzinfo=dt.timezone.utc)
        source_timestamp = source_time.astimezone(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z") if source_time else None
    except (RuntimeError, ValueError):
        source_timestamp = None

    temp_dir = Path(tempfile.mkdtemp(prefix="hiking-osm-pbf-"))
    try:
        from collections import defaultdict

        candidates = {}
        ways_to_routes = defaultdict(list)
        rejected_nested = 0

        class RelationReader(osmium.SimpleHandler):
            def relation(self, relation):
                nonlocal rejected_nested
                tags = dict(relation.tags)
                if tags.get("type") != "route" or tags.get("route") not in ("hiking", "foot"):
                    return
                name = tags.get("name", "").strip()
                if not name:
                    return
                way_ids = set()
                has_nested = False
                for member in relation.members:
                    if member.type == "w":
                        way_ids.add(member.ref)
                    elif member.type == "r":
                        has_nested = True
                if has_nested or not way_ids:
                    rejected_nested += 1
                    return
                rid = relation.id
                candidates[rid] = {
                    "name": tags.get("name:zh", name).strip() or name,
                    "originalName": name,
                    "tags": {key: tags[key] for key in TAG_ALLOWLIST if key in tags},
                    "expectedWays": len(way_ids),
                    "bounds": [math.inf, math.inf, -math.inf, -math.inf],
                    "resolvedWays": 0,
                    "resolvedNodes": 0,
                    "expectedNodes": 0,
                }
                for way_id in way_ids:
                    ways_to_routes[way_id].append(rid)

        RelationReader().apply_file(str(pbf), locations=False)
        if not candidates:
            raise ValueError("No named hiking/foot route relations with direct way members were found")

        location_index = temp_dir / "node-locations.data"

        class RouteWayReader(osmium.SimpleHandler):
            def way(self, way):
                route_ids = ways_to_routes.get(way.id)
                if not route_ids:
                    return
                nodes = list(way.nodes)
                for rid in route_ids:
                    row = candidates[rid]
                    row["resolvedWays"] += 1
                    row["expectedNodes"] += len(nodes)
                    bounds = row["bounds"]
                    for node in nodes:
                        if not node.location.valid():
                            continue
                        lon, lat = node.lon, node.lat
                        bounds[0] = min(bounds[0], lon)
                        bounds[1] = min(bounds[1], lat)
                        bounds[2] = max(bounds[2], lon)
                        bounds[3] = max(bounds[3], lat)
                        row["resolvedNodes"] += 1

        # A disk-backed index avoids keeping every regional node coordinate in RAM.
        processor = osmium.FileProcessor(str(pbf)).with_locations(f"sparse_file_array,{location_index}")
        processor = processor.with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
        processor = processor.with_filter(osmium.filter.IdFilter(ways_to_routes.keys()).enable_for(osmium.osm.WAY))
        way_reader = RouteWayReader()
        for obj in processor:
            way_reader.way(obj)

        now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        staged = {}
        incomplete = 0
        for rid, row in candidates.items():
            west, south, east, north = row["bounds"]
            if (row["resolvedWays"] != row["expectedWays"]
                    or row["expectedNodes"] < 2
                    or row["resolvedNodes"] != row["expectedNodes"]
                    or not all(math.isfinite(v) for v in (west, south, east, north))):
                incomplete += 1
                continue
            key = f"osm-relation-{rid}"
            old = existing_by_id.get(key)
            source_tags = dict(old.get("sourceTags", {})) if old else {}
            source_tags.update(row["tags"])
            old_region = old.get("region") if old else None
            region = old_region if old_region in REGIONS else classify_region(args.region, (west + east) / 2, (south + north) / 2)
            staged[key] = {
                "id": key,
                "name": row["name"],
                "originalName": row["originalName"],
                "region": region,
                "center": [(west + east) / 2, (south + north) / 2],
                "sourceUrl": f"https://www.openstreetmap.org/relation/{rid}",
                "sourceTags": source_tags,
                "fetchedAt": now,
                "status": old.get("status", "待核验") if old else "待核验",
            }
        if not staged:
            raise ValueError("No reference-complete named route records; existing catalog left unchanged")

        merged = dict(existing_by_id)
        merged.update(staged)
        if len(merged) > MAX_CATALOG_RECORDS:
            raise ValueError(f"Merged OSM catalog would exceed the {MAX_CATALOG_RECORDS}-record distribution limit")
        snapshot.update({
            "schemaVersion": 1,
            "generatedAt": now,
            "license": "ODbL-1.0",
            "attribution": "© OpenStreetMap contributors",
            "licenseUrl": "https://www.openstreetmap.org/copyright",
            "routes": sorted(merged.values(), key=lambda row: row["id"]),
            "coverageNote": "OSM discovery records only; PBF member-node references were complete for imported relations. Bounds centers are not navigable tracks or access verification.",
        })
        imports = [row for row in imports if not (isinstance(row, dict) and row.get("sourceId") == args.source_id)]
        imports.append({
            "sourceId": args.source_id,
            "region": args.region,
            "sourceUrl": args.source_url,
            "sourceTimestamp": source_timestamp,
            "sha256": digest,
            "bytes": pbf_size,
            "importedAt": now,
            "candidateRelations": len(candidates),
            "importedRelations": len(staged),
            "skippedIncompleteRelations": incomplete,
            "skippedNestedRelations": rejected_nested,
        })
        snapshot["pbfImports"] = imports[-200:]

        temporary_catalog = None
        try:
            with tempfile.NamedTemporaryFile(mode="wb", dir=catalog_path.parent, delete=False) as handle:
                temporary_catalog = Path(handle.name)
                handle.write((json.dumps(snapshot, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary_catalog, catalog_path)
        finally:
            if temporary_catalog is not None:
                temporary_catalog.unlink(missing_ok=True)
        print(json.dumps({
            "sourceId": args.source_id,
            "sourceSha256": digest,
            "candidateRelations": len(candidates),
            "importedRelations": len(staged),
            "skippedIncompleteRelations": incomplete,
            "skippedNestedRelations": rejected_nested,
            "catalogCount": len(merged),
            "catalog": str(catalog_path),
        }, ensure_ascii=False))
    finally:
        for path in temp_dir.iterdir():
            path.unlink(missing_ok=True)
        temp_dir.rmdir()


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError) as exc:
        raise SystemExit(f"OSM PBF import stopped safely: {exc}") from exc
