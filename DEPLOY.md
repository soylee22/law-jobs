# Deploying the completed build

## Status at handoff

The source, public snapshot, tests and responsive interface were built locally. The GitHub connector rejected creation of the `mithril-v2` branch with `403 Resource not accessible by integration`. **No branch, commit, pull request or deployment was created. The live site was not changed.** This error is not resolved by changing ChatGPT's ask-before-write preference; repository/app authorisation is a separate boundary.

## Apply with an authenticated local checkout or Codex

The package is already built. Its `index.html`, `web/` and `data/` work as a static site. Use a new branch in a clean checkout so the current website remains recoverable.

```sh
# 1. Unzip the package; change into its mithril-v2 directory.
# 2. Point the installer at an existing clean checkout:
./scripts/install.sh /absolute/path/to/law-jobs
```

The installer creates a branch, copies only the package's declared files, verifies file checksums and prints the remaining commands. It does not force-push, rewrite history, delete unrelated files, change repository visibility, create cloud resources or enable a new data-collection service.

To create a new checkout first:

```sh
git clone https://github.com/soylee22/law-jobs.git /path/to/law-jobs
```

After installing, test and review in that checkout:

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python scripts/build.py --out .
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.mjs
python -m pip install playwright==1.57.0
python -m playwright install chromium
python tests/browser.py --output browser-results

git diff --stat
git status --short
# Stage only reviewed package files, not .venv, private inputs or encrypted backups.
git add .
git commit -m "Build Mithril evidence-led job workspace"
git push -u origin HEAD
gh pr create --title "Mithril 2.0: evidence-led job workspace" --body-file docs/PR.md
```

Inspect the pull request and quality-check run before merging. The repository's existing branch-based GitHub Pages setup can publish the built root files when merged into `main`; `.nojekyll` is included. The supplied workflow is a **quality-check workflow**, not an automatic deployment or repository-writing workflow. Do not describe a successful test as a successful deployment. Check the separate Pages run and the live page after merge.

## Essential: prevent the old scanner overwriting the new site

Before the next scheduled scanner push, change its final publishing step to run `scripts/build.py --legacy ... --out ...` while the raw scanner output is still outside the public repository. See README. The original upstream generator was unavailable, so that integration is not silently claimed as complete.

Before merging the site upgrade, pause the old publishing job or update it. Otherwise it can overwrite the interface or republish candidate information. Merely adding a CI check after a raw push does not provide a reliable privacy boundary.

## Historical material

The deployed legacy shortlist and old artifacts already contained candidate information. This package removes it from the new files but does not remove Git history, old public artifacts or caches. Review those separately. Do not automatically rewrite the entire repository history as part of this installation.

## Rollback

Retain the pre-upgrade commit and revert the upgrade commit through a normal reviewed change if necessary. Do not restore private legacy reports to public hosting as a routine rollback. A safer emergency fallback is a minimal public landing page while fixing the app.

## Ready-to-use Codex instruction

> Implement the attached Mithril package in a new branch of my existing `soylee22/law-jobs` checkout. Read DEPLOY.md and README.md first. Preserve unrelated files and never commit private scanner inputs. Run all Python, Node and real-browser tests; fix any genuine failures. Find the actual upstream crawler/publisher in my local workspace and wire its output through the safe importer before any future push. Verify the publisher cannot overwrite the interface or republish candidate narratives. Create a pull request. Only merge after successful checks; then verify the actual GitHub Pages deployment. Do not claim that old public Git history or artifacts have been removed unless you separately inspect and remediate them with approval.
