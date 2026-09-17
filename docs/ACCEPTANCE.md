# Mithril 2.0: acceptance and handoff report

Prepared 16 September 2026. Updated 17 September 2026 after publication and live verification.

## Delivery status

**Built, tested, committed and deployed.** The guarded publisher pushed the public build to `main`. GitHub Actions quality checks and Pages deployment passed. The live site is [soylee22.github.io/law-jobs](https://soylee22.github.io/law-jobs/).

## Checks actually executed

| Layer | Passed | What was exercised |
|---|---:|---|
| Python unit and migration tests | 26 | Link repair, conservative locations, PQE extraction, source timestamps, public-field allowlists, last-good records, migration of explicit applied markers without invented dates |
| Node.js unit tests | 42 | Combined filters, search, pagination, URL state, private/public separation, safe CSV output, real Web Crypto encryption/decryption, password errors, encrypted backups, concurrent writes and stale tabs |
| Chromium embedded/offline checks | 20 | Rendered application, latest-snapshot Today boundary, 20-card limit, bounded DOM, combined filters, deep links, pagination, search, evidence labels, modal access, keyboard interactions and responsive layouts |
| Chromium real-origin checks | 26 | Same-origin modules, CSP, Web Crypto, encrypted persistence, locking and responsive layout |
| **Total automated checks** | **114** | All passed in the final local run |

Raw logs and browser check names are in `docs/test-results/`. Installer smoke-check outcomes are recorded separately in `docs/test-results/installer.json`.

## Publication verification

On 17 September 2026, the pinned local environment ran the complete suite after the Today and Shortlist clarification.

| Layer | Result |
|---|---:|
| Python unit and migration tests | 26 passed |
| Node.js unit tests | 42 passed |
| Chromium embedded/offline checks | 20 passed |
| Chromium real-origin checks | 26 passed |
| Total checks in this verification | 114 passed |

The real-origin run used Playwright 1.57.0 with its Chromium 143.0.7499.4 binary. It exercised same-origin modules, CSP, Web Crypto, encrypted persistence, locking and responsive layout. GitHub Actions then passed the same quality checks and Pages deployment.

### Package-time browser coverage boundary

The explicitly labelled `--embedded` mode loads the same HTML, CSS, JavaScript and job snapshot into an offline document. It removes module imports and the CSP declaration for that test document and uses a fixture fetch. Normal mode loads the application from a local HTTP origin and exercises the production module and encryption path. A separate live smoke check loaded the GitHub Pages URL and confirmed the latest-snapshot boundary.

These checks do not establish a full accessibility audit, live advert availability or device-lab performance. No independent security audit has been performed.

### Visual and performance observations

Desktop (1440-pixel viewport) screenshots from the local build and live page were inspected. The app rendered 20 cards initially, with fewer than 1,200 DOM elements in the test. No horizontal overflow occurred at 360, 390 or 768 pixels. The first mobile listing began above 550 pixels. No uncaught JavaScript exceptions were recorded in the executed browser checks.

These are local layout and document-complexity observations, not measured production loading times, Core Web Vitals or device-lab results. Pagination bounds DOM size; the JSON snapshot is still fetched as one dataset.

## Data migration results

| Item | Result |
|---|---:|
| Listed records | 3,901 |
| Missing records | 1,153 |
| Uncertain records | 863 |
| Total retained records | 5,917 |
| New in this snapshot | 409 |
| Relative application links repaired | 12 |
| Unknown locations across all retained records | 219 |
| Source observation | 17 September 2026, 20:10 UTC |

The refreshed source routes produced the current snapshot. No advert was independently verified as open during this build. All imported full-description verification dates remain unknown. Repaired URLs are syntactically resolved against known employer origins, not promises that every vacancy remains open.

The importer reads public listing fields, not the old questionnaire-based shortlist. Private application statuses, candidate narratives and client/matter information are absent from the public snapshot. An optional local-only encrypted migration tool is provided for explicit historical applied markers; no personal backup is bundled.

## Post-publication notes

1. Keep future scanner output outside the public checkout and route it through the safe importer before each push.
2. Keep the current quality and Pages workflows passing before publication.
3. Decide how to remediate previously public history and artifacts separately. This package does not erase history, caches or old deployments.

## Explicitly not delivered

A new live crawling service; comprehensive advert-body verification; automatic candidate eligibility decisions; cloud account or cross-device sync; automated job alerts; hosted private profile storage; application submission; exhaustive deduplication; confirmation that disappeared jobs are closed; remediation of historic public material.

The delivered release is a maintainable, evidence-aware discovery interface with a publish-safe migration layer and encrypted local workflow. Stronger matching depends on obtaining trustworthy structured source data and connecting the upstream collector.
