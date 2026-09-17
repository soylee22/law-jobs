# Architecture and publishing boundaries

```
Existing private scanner output
          │
          ▼
 scripts/build.py  ── strict field allowlist + safe URL identities
          │
          ▼
 data/jobs.json + web/ templates ──> built public root site
          │
          ▼
 Browser: core.mjs → app.mjs → paginated results
          │
          └── vault.mjs → encrypted localStorage / encrypted backup
```

## Module responsibilities

`core.mjs` owns deterministic search, combined filtering, explicit PQE overlap, discovery-order signals, URL state and public CSV generation. It contains no credentials, candidate biography or network requests. It does not assign an eligibility probability.

`app.mjs` owns presentation, events, dialogs, public-data loading and the application workflow. It escapes displayed strings, never submits applications, and opens adverts only on a user action. It loads one same-origin snapshot and uses 20-record pages rather than a several-thousand-row DOM.

`vault.mjs` owns passphrase-derived encryption, local persistence, write serialisation, stale-tab checks, backup validation and import/export. There is no server-held private database or automatic device synchronisation. Decrypted data is cleared on locking and navigation; the key is not persisted.

`scripts/build.py` owns the migration/compatibility boundary. It selects public vacancy fields from known legacy structures, never reads the old candidate shortlist, and turns former pages into redirects. It refuses an empty replacement and rejects extra public-record fields. Unknown location, PQE and description-verification values remain unknown. Future absence retains the last-good record with unknown status rather than proving closure.

## Data identity and duplicate policy

Canonical URLs strip only known tracking fields, preserve semantic query fields, normalise supported LinkedIn IDs and repair two explicitly established employer-host patterns. The public record ID is the first 24 hexadecimal characters of SHA-256 of the canonical identity. Invalid URLs fall back to a hash of source strings and are not exposed as live links.

Distinct URLs with matching normalised company/title/location are only possible duplicates. No probabilistic merge is silently performed. A single known identity cannot be both present and missing. Private history is keyed to the canonical identity, and a copy of the public vacancy snapshot is stored inside the encrypted workspace so tracked jobs remain readable if the public feed drops them.

## Source dates and verification

`generatedAt` is package time; `snapshotAt` is the newest supplied route observation. Each vacancy separately stores `sourceLastSeen`, `firstSeen`, `descriptionCheckedAt` and `status`. Build-only refreshes preserve the original observation timestamps. This HTML importer cannot substantiate full-description checks and therefore always leaves `descriptionCheckedAt` null.

The source-health view reports legacy counters as reported: selection, fresh fetches, cache hits and failures. It does not imply that a cache hit is current or that a description-fetch error is a discovery failure.

## Known integration gap

The original crawler/publisher was absent from the inspected repository and unavailable through the other attempted source lookup. Its local task must be changed to call the importer before pushing. A post-push CI failure alone cannot prevent GitHub Pages publishing raw confidential material. Do not rely on that as a security boundary.
