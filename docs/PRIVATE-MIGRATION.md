# Recover the old applied markers without publishing them

The public-data migration deliberately excludes applied flags and candidate narratives. The separate private migration command can recover **explicit applied markers** from the original `all.html` into an encrypted backup. It does not guess outcomes or application dates and does not import the old questionnaire/matter narratives.

Keep the original HTML and resulting backup outside the public repository. For a local checkout that contains the historical commit, recover the original file into a private folder first:

```sh
mkdir -p "$HOME/.mithril-migration"
chmod 700 "$HOME/.mithril-migration"
git show 40a1184c9d4c34da98b6442a89b56a1107414e74:all.html > "$HOME/.mithril-migration/all.html"
chmod 600 "$HOME/.mithril-migration/all.html"

python scripts/migrate_private.py \
  --legacy "$HOME/.mithril-migration/all.html" \
  --output "$HOME/.mithril-migration/applied-history-encrypted.json"
```

The command asks for a new passphrase in your terminal; do not send it in chat or add it to a command argument. The helper derives a key locally and emits a valid Mithril encrypted backup. The output is created with owner-only file permissions and cannot overwrite an existing file.

Open **Workspace & privacy → Restore backup** in the new website and use that passphrase. Do this before adding new tracker entries. Restore intentionally replaces rather than silently merges the browser workspace, so export any existing workspace first. The original applied date is shown as unknown: import time is not substituted for application time.

An applied flag is only as reliable as the original scanner/tracker. The migration cannot infer interview stage, rejection, notes, or private information that was never present in the supplied marker.
