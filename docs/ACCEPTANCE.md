# Mithril 2.0 — acceptance and handoff report

Prepared 16 September 2026. This report describes the packaged local build, not the current public website.

## Delivery status

**Built and tested locally; not committed or deployed.** The GitHub integration returned `403 Resource not accessible by integration` when asked to create `mithril-v2`. No branch, commit, pull request, remote CI run or deployment was created. The existing live website remains unchanged, including any legacy material it currently exposes.

## Checks actually executed

| Layer | Passed | What was exercised |
|---|---:|---|
| Python unit and migration tests | 26 | Link repair, conservative locations, PQE extraction, source timestamps, public-field allowlists, last-good records, migration of explicit applied markers without invented dates |
| Node.js unit tests | 42 | Combined filters, search, pagination, URL state, private/public separation, safe CSV output, real Web Crypto encryption/decryption, password errors, encrypted backups, concurrent writes and stale tabs |
| Chromium embedded/offline checks | 16 | Rendered application, 20-card limit, bounded DOM, combined filters, deep links, pagination, search, evidence labels, modal access, keyboard interactions and responsive layouts |
| **Total automated checks** | **84** | All passed in the final local run |

Raw logs and browser check names are in `docs/test-results/`. Installer smoke-check outcomes are recorded separately in `docs/test-results/installer.json`.

## Verification after package preparation

On 17 September 2026, the pinned local environment ran the complete suite. The browser test had one CSP-incompatible wait helper. It was replaced with a Playwright locator assertion. No application code changed.

| Layer | Result |
|---|---:|
| Python unit and migration tests | 26 passed |
| Node.js unit tests | 42 passed |
| Chromium embedded/offline checks | 16 passed |
| Chromium real-origin checks | 22 passed |
| Total checks in this verification | 106 passed |

The real-origin run used Playwright 1.57.0 with its Chromium 143.0.7499.4 binary. It exercised same-origin modules, CSP, Web Crypto, encrypted persistence, locking and responsive layout. The run did not deploy or change the public site.

### Package-time browser coverage boundary

The environment blocks ordinary browser navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. The executed browser suite therefore used the explicitly labelled `--embedded` mode: it loaded the same HTML, CSS, JavaScript and job snapshot into an offline document. It removed module imports and the CSP declaration for that test document and used a fixture fetch. It did not bypass browser navigation controls.

These checks establish rendered-DOM and UI behaviour, **not** real-origin ES-module loading, CSP enforcement, production network behaviour or browser-level encrypted-workspace integration. Encryption and persistence logic were tested separately using actual Node Web Crypto. The supplied normal-mode Playwright suite covers real-origin loading and workspace behaviour and must still be run in an unrestricted development environment or CI. No independent security audit or full accessibility audit has been performed.

### Visual and performance observations

Desktop (1440-pixel viewport) and mobile (390-pixel viewport) screenshots were inspected. The app rendered 20 cards initially, with fewer than 1,200 DOM elements in the test. No horizontal overflow occurred at 360, 390 or 768 pixels. The first mobile listing began above 550 pixels (approximately 480 in the inspected capture). No uncaught JavaScript exceptions were recorded in the executed browser checks.

These are local layout and document-complexity observations, not measured production loading times, Core Web Vitals or device-lab results. Pagination bounds DOM size; the JSON snapshot is still fetched as one dataset.

## Data migration results

| Item | Result |
|---|---:|
| Present-in-snapshot listings | 3,853 |
| Missing/uncertain historical listings | 1,269 |
| Total retained records | 5,122 |
| Relative application links repaired | 11 |
| Unknown locations across all retained records | 187 |
| Source observation | 16 September 2026, 07:26 UTC |

The 36-listing increase over the legacy combined page preserves records present in route outputs. It is not evidence of a new crawl. No advert was freshly verified as open during this build. All imported full-description verification dates remain unknown. Repaired URLs are syntactically resolved against known employer origins, not promises that every vacancy remains open.

The importer reads public listing fields, not the old questionnaire-based shortlist. Private application statuses, candidate narratives and client/matter information are absent from the public snapshot. An optional local-only encrypted migration tool is provided for explicit historical applied markers; no personal backup is bundled.

## Acceptance still required before publishing

1. Apply the package from a write-authorised checkout, inspect the diff, and run normal-mode browser tests and CI.
2. Locate the actual upstream crawler/publisher. Pause its raw-HTML pushes or route them through the safe importer **before** merging. That source was not present in the accessible repository and has not been modified.
3. Review the separate GitHub Pages deployment and actual live interface after merge. A passed unit test is not a deployment confirmation.
4. Decide how to remediate previously public history and artifacts separately. This package does not erase history, caches or old deployments.

## Explicitly not delivered

A new live crawling service; comprehensive advert-body verification; automatic candidate eligibility decisions; cloud account or cross-device sync; automated job alerts; hosted private profile storage; application submission; exhaustive deduplication; confirmation that disappeared jobs are closed; remediation of historic public material.

The delivered release is a maintainable, evidence-aware discovery interface with a publish-safe migration layer and encrypted local workflow. Stronger matching depends on obtaining trustworthy structured source data and connecting the upstream collector.
