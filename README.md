# Mithril 2.0

An evidence-led legal job-search workspace, built from the existing `soylee22/law-jobs` scanner outputs. No frontend framework, no analytics, no third-party client scripts, no paid API requirement.

## What works

The application offers a responsive Today view, full discovery, combined search and filters, exact-phrase and exclusion search, stable URL state, 20-result pagination, practice-area discovery signals, explicit PQE evidence, source-health reporting and possible cross-post flags. A job detail view separates source observation, first discovery, description verification and the user's own review.

Saved roles, application stages, histories, notes, follow-up dates and saved searches belong in an **encrypted local workspace**, not the public feed. The workspace supports encrypted backup/restore and automatic inactivity locking. It does not synchronise across devices or submit applications.

The importer fixes the known Morgan Stanley/Vodafone relative-link patterns, conservatively handles unknown locations, avoids treating "Associate" as automatically NQ or "Attorney" as automatically senior, canonicalises obvious URL aliases and prevents a vacancy being listed as both present and missing. Disappearance is never silently translated into confirmed closure.

## Included snapshot

The migration uses the audited deployment at commit `40a1184c9d4c34da98b6442a89b56a1107414e74`, observed 16 September 2026. It retains **3,853 present-in-snapshot listings** and **1,269 missing/uncertain historical listings**. The 36-row increase over the old combined page comes from preserving records found in route outputs, not from claiming 36 newly discovered jobs. Eleven relative links are repaired. No jobs were freshly crawled as part of this migration.

Every imported description-verification date remains unknown. An old "high-fit" score or cached keyword signal is not evidence that an advert has been read or that a candidate meets its requirements. None of the old detailed candidate narratives or applied badges are copied into the public JSON.

## Run locally

Use Python 3.12+ and Node.js 22+ for development and tests. The deployed site itself requires only a modern browser.

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python scripts/build.py --out .
python -m http.server 8000
```

Open `http://localhost:8000`. Do not open the HTML directly as a file: ES modules, fetch and Web Crypto require a proper web origin. Production should use HTTPS. No configuration file should contain credentials.

## Test

```sh
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.mjs
python -m pip install playwright==1.57.0
python -m playwright install chromium
python tests/browser.py --output browser-results
```

`tests/browser.py --embedded` is an offline DOM/visual test mode for environments where browser navigation is blocked. It deliberately embeds source and fixture data, so it **does not** establish real module loading, CSP enforcement or browser Web Crypto integration. Normal mode and the supplied GitHub Actions workflow include those checks. The local package verification on 17 September 2026 passed normal mode with the pinned Playwright and Chromium versions. See the acceptance report for the precise coverage boundary.

## Source of truth and refreshes

Edit `web/index.html`, `web/app.css`, `web/app.mjs`, `web/core.mjs`, `web/vault.mjs` and the Python importer. The root `index.html` is generated from the template. The other old root pages are redirects. `data/jobs.json` is the public-data contract.

**The original crawler was not available in this repository.** This package adds a publish-safe importer; it does not pretend to repair unseen upstream code or invent a new live crawling service. Change the existing scanner's publishing step to:

```sh
# The legacy scanner output must be generated OUTSIDE the public repository.
python scripts/build.py --legacy /private/path/to/scanner-output --out /path/to/law-jobs
# Run checks, then commit the safe output — not the original HTML reports.
```

Without this change, the old scanner may overwrite the new interface or republish private material. CI detects generated-output discrepancies but, by itself, does not prevent a branch-based GitHub Pages site publishing an unsafe push. Require the quality check before merging publisher changes and stop direct raw-HTML pushes.

A rebuild of existing JSON does not change source-observation or first-seen dates. Failed or missing inputs are not proof of closure. Last-good records absent from a subsequent import remain available with unknown status rather than being silently deleted.

## Privacy and security boundaries

The public snapshot has an explicit field allowlist. Candidate questionnaires, assessments, matter/client narratives, applied flags and notes are excluded. Old URLs redirect into the new app rather than retaining the sensitive shortlist document. However, **historical Git commits, old deployment artifacts and external caches are not erased**. Historical remediation is a separate decision; no destructive history rewrite is included.

The local workspace uses Web Crypto PBKDF2-HMAC-SHA-256 with 600,000 iterations, a random 16-byte salt, and AES-256-GCM with a fresh random 12-byte IV on every save. Passwords and keys remain in memory; persistent storage and backups contain ciphertext. This is not an independently audited security product or a server-side access-control system. It does not protect unlocked data from device compromise, hostile extensions or malicious same-origin scripts. Use a long unique passphrase and protect the device. There is no password recovery.

The client escapes displayed data, validates external URLs, avoids third-party resources, uses a restrictive content security policy and prevents public CSV exports from including private notes. Backups are verified before replacing existing data. Concurrent writes are queued, and stale-tab updates are rejected.

## Next engineering priorities

Connect the actual upstream crawler and replace HTML ingestion with a structured public-data export. Then add per-advert full-description evidence and requirement-level candidate matching in a genuinely private execution environment. Introduce employer-verified requisition identities and explicit closure checks before making stronger duplicate or availability claims. Cloud sync, a hosted private profile store and automated alerts are not implemented in this release.

For existing application history, `scripts/migrate_private.py` can recover explicit applied markers into a separately encrypted backup. Read `docs/PRIVATE-MIGRATION.md`; no private backup is bundled or uploaded.

See `DEPLOY.md`, `docs/ACCEPTANCE.md`, `docs/ARCHITECTURE.md` and `docs/CHANGELOG.md`.
