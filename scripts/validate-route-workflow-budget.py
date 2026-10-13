#!/usr/bin/env python3
"""Fail closed when route collector timeouts consume the publication window."""

from pathlib import Path
import re
import sys


WORKFLOW = Path("workflow-source/.github/workflows/route-catalog-update.yml")
MINIMUM_PUBLISH_WINDOW_MINUTES = 30
EXPECTED_COLLECTOR_IDS = {
    "usda",
    "osm_incremental",
    "hk",
    "nzdoc",
    "parkscanada",
    "nps_public_trails",
    "victoria_recreation_tracks",
    "nsw_npws",
    "england",
    "wales",
    "scotland_argyll",
    "ni_midulster",
    "norfolk_prow",
    "cambridgeshire_prow",
    "content",
}
EXPECTED_REPORT_KEYS = {
    "usfs",
    "osm_incremental",
    "hk",
    "nzdoc",
    "parkscanada",
    "nps-public-trails",
    "victoria-recreation-tracks",
    "nsw-npws",
    "england",
    "wales",
    "scotland-argyll",
    "ni-midulster",
    "norfolk-prow",
    "cambridgeshire-prow",
    "news",
}


def main() -> int:
    text = WORKFLOW.read_text(encoding="utf-8")
    job_limit_match = re.search(r"(?m)^    timeout-minutes:\s*(\d+)\s*$", text)
    source_window_match = re.search(
        r"(?ms)^      - name: Collect .*?(?=^      - name: Record collection outcomes)",
        text,
    )
    if not job_limit_match or not source_window_match:
        print("Could not identify the route job limit or collector section.", file=sys.stderr)
        return 1

    job_limit = int(job_limit_match.group(1))
    step_blocks = re.findall(
        r"(?ms)^      - name: ([^\n]+)\n(.*?)(?=^      - name:|\Z)",
        source_window_match.group(0),
    )
    collectors = [(name, body) for name, body in step_blocks if name.startswith("Collect ")]
    if not collectors:
        print("No route collectors were found.", file=sys.stderr)
        return 1

    collector_ids = set()
    for name, body in collectors:
        id_match = re.search(r"(?m)^        id:\s*([a-z0-9_-]+)\s*$", body)
        if not id_match:
            print(f"Collector has no stable step ID: {name}", file=sys.stderr)
            return 1
        collector_ids.add(id_match.group(1))
    if collector_ids != EXPECTED_COLLECTOR_IDS:
        print(
            "Collector step IDs changed without updating the budget and source-status contract: "
            f"missing={sorted(EXPECTED_COLLECTOR_IDS - collector_ids)}, "
            f"unexpected={sorted(collector_ids - EXPECTED_COLLECTOR_IDS)}",
            file=sys.stderr,
        )
        return 1

    report_gate_match = re.search(r"(?ms)^          sources = \(\n(.*?)^          \)", text)
    if not report_gate_match:
        print("Could not identify the incomplete-source report gate.", file=sys.stderr)
        return 1
    report_keys = set(re.findall(r"'([^']+)'", report_gate_match.group(1)))
    if report_keys != EXPECTED_REPORT_KEYS:
        print(
            "Incomplete-source report keys changed without updating the source-status contract: "
            f"missing={sorted(EXPECTED_REPORT_KEYS - report_keys)}, "
            f"unexpected={sorted(report_keys - EXPECTED_REPORT_KEYS)}",
            file=sys.stderr,
        )
        return 1

    total = 0
    for name, body in collectors:
        timeout_match = re.search(r"(?m)^        timeout-minutes:\s*(\d+)\s*$", body)
        if not timeout_match or "        continue-on-error: true" not in body:
            print(f"Collector is missing a timeout or failure isolation: {name}", file=sys.stderr)
            return 1
        timeout = int(timeout_match.group(1))
        if timeout <= 0:
            print(f"Collector timeout must be positive: {name}", file=sys.stderr)
            return 1
        total += timeout

    remaining = job_limit - total
    if remaining < MINIMUM_PUBLISH_WINDOW_MINUTES:
        print(
            f"Collector budget is {total}/{job_limit} minutes; only {remaining} minutes remain, "
            f"below the {MINIMUM_PUBLISH_WINDOW_MINUTES}-minute validation/publication reserve.",
            file=sys.stderr,
        )
        return 1

    print(f"Route collector budget: {total}/{job_limit} minutes; {remaining} minutes remain.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
