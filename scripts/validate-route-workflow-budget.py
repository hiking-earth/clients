#!/usr/bin/env python3
"""Fail closed when route collector timeouts consume the publication window."""

from pathlib import Path
import re
import sys


WORKFLOW = Path(".github/workflows/route-catalog-update.yml")
MINIMUM_PUBLISH_WINDOW_MINUTES = 30


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
    section = source_window_match.group(0)
    step_blocks = re.findall(
        r"(?ms)^      - name: ([^\n]+)\n(.*?)(?=^      - name:|\Z)", section
    )
    collectors = [(name, body) for name, body in step_blocks if name.startswith("Collect ")]
    if not collectors:
        print("No route collectors were found.", file=sys.stderr)
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
            f"Collector budget is {total} minutes with a {job_limit}-minute job cap; "
            f"only {remaining} minutes remain, below the {MINIMUM_PUBLISH_WINDOW_MINUTES}-minute "
            "validation/publication reserve.",
            file=sys.stderr,
        )
        return 1

    print(
        f"Route collector budget: {total}/{job_limit} minutes; "
        f"{remaining} minutes remain for validation and publication."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
