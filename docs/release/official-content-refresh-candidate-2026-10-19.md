# Official announcement refresh candidate — 2026-10-19

## Status

Candidate source changes only. This worktree is based on `codex/mobile-privacy-controls` at `6aa92897cf4037db40a88a848659b5c344f80ec5`, the source ref checked out by the scheduled catalog workflow. The focused route/news policy, feed transport/XML, publication, collection-status, and workflow-entrypoint checks passed locally (55 test cases total, plus the entrypoint checker and `git diff --check`). It has not been pushed, merged, run in GitHub Actions, deployed, or accepted on a device. GitHub CLI currently reports its saved token is invalid. The release manifest must remain disabled.

## Intended behavior

- Collect RSS metadata only: a short title, a source-attributed link, region, publication time, and fetch time. Do not copy article bodies or images. An announcement is a pointer to official information and never proof that a trail is open, legal, or safe.
- Validate source configuration and require a current accepted-source review snapshot before publication. Keep the source-specific use-terms URL with each feed record. Preserve unexpired records if one feed is malformed or unavailable; quarantine rejected and expired records with reasons and timestamps.
- Withdraw announcements more than 90 days past publication before immutable catalog-page generation, so an old news item cannot block publication indefinitely.
- Bound RSS response size and records per source; reject DTDs and cross-host or non-HTTPS redirects; serialize concurrent local collection and atomically replace the data snapshot.
- Resolve the entrypoint-checker false positive for `pyproj`: the workflow installs `pyproj==3.8.0` before invoking the checker. Only explicit pip packages declared before the checker and whose normalized names match the import module are accepted as external dependencies.

## Candidate changes

- `scripts/official_content_policy.py`: registry bounds, review snapshots, publication expiry, per-source fail-closed snapshot replacement, and withheld history.
- `scripts/update-official-content.py`: bounded metadata-only collection, source selection, safe transport, feed/source outcomes, and atomic snapshot write.
- `scripts/official_feed_xml.py` and `scripts/official_feed_transport.py`: DTD rejection and same-host HTTPS redirect policy.
- `scripts/check-route-workflow-entrypoints.py`: recognizes workflow-declared external packages installed before the checker.
- `scripts/publish-public-catalog.py`: fails closed if production and candidate snapshots have the same generation time but different source hashes; equal time plus identical hash remains idempotent.
- `shared/data/content/official-sources.json`: snapshots the currently configured fields of the already accepted feeds.
- Related policy, transport, XML, publication, collection-status, and workflow-checker regression cases were run as focused checks for this candidate. They do not replace the later full frozen test/build matrix.

## Required next evidence

1. Finish the remaining independent product functionality before the unified verification stage.
2. Run all affected route/news policy and workflow-entrypoint tests plus the complete frozen test/build matrix; fix failures within the agreed bounded repair attempts.
3. The explicit candidate files are committed locally. After GitHub authorization is restored, re-read the remote branch head and ancestry before publishing this commit on a review branch and opening a PR into `codex/mobile-privacy-controls`; the scheduled workflow reads its collectors from that branch. Do not merge until required CI passes.
4. Observe a real scheduled workflow run. Confirm fresh records publish, expired records move to the withheld archive, failed sources retain their prior valid snapshot, generated pages validate, and the production catalog read branch updates.
5. Verify the live client API only if an authorized, free deployment is available. A successful local run or GitHub data commit alone does not prove cloud deployment or client acceptance.

## Evidence boundary

The National Park Service describes RSS as a way for readers to collect updated headlines, while its general disclaimer says some site materials may carry third-party rights. DATA.GOV.HK's current terms allow free distribution and hyperlinks subject to attribution and other terms. The collector therefore keeps metadata and links only; this registry evidence is not a blanket license for full text, images, route geometry, or trail-access claims. Sources: <https://www.nps.gov/feeds/rss-help.htm>, <https://www.nps.gov/aboutus/disclaimer.htm>, and <https://data.gov.hk/en/terms-and-conditions>.
