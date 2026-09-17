## Summary

Replace generated iframe dashboards with the Mithril evidence-led search workspace. Preserve public listings, remove candidate material from current public files, make combined filtering/search/navigation reliable, and add a local encrypted application workspace.

## Included

Responsive application; exact/negative search; combined location, source, PQE, work-pattern and new-in-snapshot filters; stable deep links; bounded rendering; evidence details; source health; transparent discovery signals; canonical URL identities; possible cross-post flags; safe historical statuses; encrypted local tracking/backup/restore; publisher importer; tests and documentation.

## Required before merging

- Run the supplied quality checks, including real-browser mode.
- Connect the actual upstream publisher to the safe importer, or pause raw pushes.
- Confirm current public files contain no candidate questionnaire, matter narratives or application history.
- Treat historical Git commits and old artifacts as a separate privacy-remediation task.
- Confirm the live Pages deployment after merge, not merely the CI run.

## Deliberate limits

No new full-market crawler, cloud account/sync, private candidate inference service or verified live eligibility decision is claimed. The included snapshot is from 16 September 2026. Local encryption is not independently audited. The upgrade does not erase old public history.
