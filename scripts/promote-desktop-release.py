#!/usr/bin/env python3
"""Publish a verified desktop candidate only after the unified acceptance gate."""
import argparse
import json
import pathlib
import re
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlsplit

REPO = "hiking-earth/clients"
PLATFORMS = {
    "windows-x86_64": ".msi",
    "darwin-aarch64": ".app.tar.gz",
    "linux-x86_64": ".AppImage",
}
REQUIRED_ACCEPTANCE = ["android", "h5", "weixin", "web", "windows", "macos", "macos-aarch64", "macos-x86_64", "linux"]
DESKTOP_REPORT_KEYS = {
    "windows-x86_64": "windows",
    "darwin-aarch64": "macos-aarch64",
    "darwin-x86_64": "macos-x86_64",
    "linux-x86_64": "linux",
}


def gh_json(*args):
    return json.loads(subprocess.check_output(["gh", "api", *args], text=True))


def stop(message):
    raise SystemExit(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag", help="Existing desktop candidate tag, for example v0.2.1")
    parser.add_argument("--acceptance-report", required=True, type=pathlib.Path)
    args = parser.parse_args()
    if not re.fullmatch(r"v\d+\.\d+\.\d+", args.tag):
        stop("Expected a stable semantic-version tag such as v0.2.1")

    report = json.loads(args.acceptance_report.read_text())
    if not isinstance(report, dict) or not isinstance(report.get("platforms"), dict):
        stop("Acceptance report must contain an object with per-platform evidence")
    source_commit = report.get("sourceCommit")
    version = args.tag[1:]
    platforms = report["platforms"]
    if report.get("schemaVersion") != 1 or report.get("complete") is not True:
        stop("Complete unified acceptance report required; candidate remains draft")
    if not re.fullmatch(r"[a-f0-9]{40}", str(source_commit or "")):
        stop("Acceptance report must pin the complete source commit")
    if report.get("version") != version:
        stop("Acceptance version differs from requested desktop release")
    if any(not isinstance(platforms.get(name), dict) or platforms[name].get("status") != "passed"
           for name in REQUIRED_ACCEPTANCE):
        stop("Unified acceptance is incomplete; desktop release remains draft")
    if not isinstance(platforms.get("ios"), dict) or platforms["ios"].get("status") not in ("passed", "blocked-owner"):
        stop("iOS must pass or be explicitly waiting for owner signing/credentials")

    release = gh_json(f"repos/{REPO}/releases/tags/{args.tag}")
    if release.get("draft") is not True or release.get("prerelease") is not False:
        stop("Expected an unpublished, non-prerelease candidate")
    commit = gh_json(f"repos/{REPO}/commits/{args.tag}").get("sha")
    if commit != source_commit:
        stop("Candidate tag does not resolve to the accepted source commit")
    assets = release.get("assets")
    if not isinstance(assets, list):
        stop("Release asset list is invalid")
    by_name = {}
    for asset in assets:
        name = asset.get("name") if isinstance(asset, dict) else None
        if isinstance(name, str):
            if name in by_name:
                stop(f"Duplicate release asset: {name}")
            by_name[name] = asset
    if "latest.json" not in by_name:
        stop("Verified desktop latest.json is missing; candidate remains draft")

    with tempfile.TemporaryDirectory(prefix="hiking-desktop-release-") as temporary:
        work = pathlib.Path(temporary)
        subprocess.run(["gh", "release", "download", args.tag, "--repo", REPO,
                        "--pattern", "latest.json", "--dir", str(work)], check=True)
        manifest = json.loads((work / "latest.json").read_text())
        if not isinstance(manifest, dict) or manifest.get("version") != version or not isinstance(manifest.get("platforms"), dict):
            stop("Desktop updater manifest version or platform map is invalid")
        for platform, suffix in PLATFORMS.items():
            report_key = DESKTOP_REPORT_KEYS[platform]
            expected_sha = platforms[report_key].get("updaterArtifactSha256")
            if not isinstance(expected_sha, str) or not re.fullmatch(r"[a-f0-9]{64}", expected_sha):
                stop(f"Acceptance report must pin the tested updater artifact SHA-256 for {report_key}")
            entry = manifest["platforms"].get(platform)
            if not isinstance(entry, dict) or not isinstance(entry.get("signature"), str) or not entry["signature"].strip():
                stop(f"Updater manifest entry is missing for {platform}")
            url = entry.get("url")
            parsed = urlsplit(url) if isinstance(url, str) else None
            parts = [unquote(part) for part in parsed.path.split("/")] if parsed else []
            if (not parsed or parsed.scheme != "https" or parsed.hostname != "github.com"
                    or parsed.username or parsed.password or parsed.port
                    or len(parts) < 3 or parts[-3:-1] != ["download", args.tag]):
                stop(f"Updater URL is not pinned to release {args.tag}: {platform}")
            artifact_name = parts[-1]
            if pathlib.PurePosixPath(artifact_name).name != artifact_name or not artifact_name.endswith(suffix):
                stop(f"Unexpected updater artifact name for {platform}")
            signature_name = artifact_name + ".sig"
            artifact_meta, signature_meta = by_name.get(artifact_name), by_name.get(signature_name)
            if not artifact_meta or not signature_meta:
                stop(f"Release is missing updater artifact or signature for {platform}")
            if url != artifact_meta.get("browser_download_url"):
                stop(f"Updater URL does not match the release asset for {platform}")
            subprocess.run(["gh", "release", "download", args.tag, "--repo", REPO,
                            "--pattern", artifact_name, "--pattern", signature_name,
                            "--dir", str(work)], check=True)
            subprocess.run([sys.executable, str(pathlib.Path(__file__).with_name("check-package-budget.py")),
                            str(work / artifact_name)], check=True, capture_output=True, text=True)
            signature_file = work / signature_name
            if signature_file.read_text().strip() != entry["signature"].strip():
                stop(f"Updater signature differs from the signed release asset for {platform}")
            verified = subprocess.run(["node", "scripts/verify-desktop-updater.mjs", str(work / artifact_name)],
                                      check=True, capture_output=True, text=True)
            verification = json.loads(verified.stdout)
            if (verification.get("signatureVerified") is not True
                    or verification.get("sha256") != expected_sha
                    or verification.get("size") != artifact_meta.get("size")):
                stop(f"Release asset differs from the updater artifact accepted for {report_key}")

        published = gh_json(f"repos/{REPO}/releases/{release['id']}", "-X", "PATCH",
                            "-F", "draft=false", "-f", "make_latest=true")
        if published.get("draft") is not False or published.get("tag_name") != args.tag:
            stop("GitHub did not confirm publication; inspect release state before retrying")
        latest = gh_json(f"repos/{REPO}/releases/latest")
        if latest.get("tag_name") != args.tag:
            stop("Release published, but GitHub latest channel does not point to the accepted tag")
    print(f"Published verified desktop release {args.tag} from {source_commit}")


if __name__ == "__main__":
    main()
