#!/usr/bin/env bash
set -euo pipefail
PACKAGE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-}"
if [[ -z "$TARGET" || ! -d "$TARGET/.git" ]]; then
  echo 'Usage: ./scripts/install.sh /absolute/path/to/a/clean/law-jobs-checkout' >&2
  exit 2
fi
TARGET="$(cd "$TARGET" && pwd)"
if [[ "$PACKAGE" == "$TARGET" ]]; then echo 'Package and checkout must be different directories.' >&2; exit 2; fi
if [[ -n "$(git -C "$TARGET" status --porcelain)" ]]; then echo 'Checkout is not clean. Commit or preserve existing work before installing.' >&2; exit 2; fi
REMOTE="$(git -C "$TARGET" remote get-url origin)"
if [[ "$REMOTE" != *'soylee22/law-jobs'* ]]; then echo 'Expected the soylee22/law-jobs repository. Refusing to install elsewhere.' >&2; exit 2; fi
BRANCH="mithril-v2-$(date +%Y%m%d-%H%M%S)"
git -C "$TARGET" switch -c "$BRANCH"
python3 - "$PACKAGE" "$TARGET" <<'PY'
import hashlib,json,shutil,sys
from pathlib import Path
src,dst=map(Path,sys.argv[1:]); manifest=json.loads((src/'PACKAGE-MANIFEST.json').read_text())
for item in manifest['files']:
    relative=Path(item['path'])
    if relative.is_absolute() or '..' in relative.parts or '.git' in relative.parts:
        raise SystemExit('Unsafe manifest path')
    f=src/relative
    if hashlib.sha256(f.read_bytes()).hexdigest()!=item['sha256']:
        raise SystemExit('Checksum mismatch: '+str(relative))
# Verify every file before copying any file.
for item in manifest['files']:
    relative=Path(item['path']); target=dst/relative
    target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src/relative,target)
print('Copied',len(manifest['files']),'verified package files.')
PY
printf '\nInstalled on branch %s. Nothing has been committed or pushed.\n' "$BRANCH"
printf 'Next: cd "%s" and follow the test and pull-request commands in DEPLOY.md.\n' "$TARGET"
git -C "$TARGET" status --short
