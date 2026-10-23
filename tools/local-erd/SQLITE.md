# Local SQLite workspace

KeepERD local builds (`VITE_LOCAL_ERD=true`) read and save through the same-origin `/api/workspace` API to `keeperd.sqlite` in the existing user state directory. Standard ChartDB web builds keep their IndexedDB storage. There is no separate SQLite service, database user, or schema setup.

## Runtime and installation

KeepERD 0.1.4 requires exactly **Node.js 26.12.1**, which includes SQLite **3.54.0**. Development files, npm engines, Docker, PR CI, and release CI use the same version. CLI/server startup rejects another patch version. The Homebrew formula supplies an official, checksum-pinned Node runtime inside KeepERD's private installation directory, independently of the system Node. The release archive itself does not contain Node or `node_modules`; manual installations must supply the exact runtime.

The built-in `node:sqlite` API is currently release candidate software. Keeping the exact Node executable also fixes the module and SQLite engine versions; it does not remove existing bugs. A runtime upgrade requires updating the pins and rerunning migration, persistence, conflict, backup, and extracted-release checks. Two shared TypeScript algorithms are included in release archives and run with Node's built-in type stripping.

## Location and persistence

On macOS the default is `~/Library/Application Support/KeepERD/keeperd.sqlite`. Other platforms use the existing `stateDirectory()` location. `KEEPERD_STATE_DIR` accepts an absolute override. The database uses mode 0600, WAL, `synchronous=FULL`, and a five-second busy timeout. Static `/data/` requests cannot download the SQLite database.

The database stores complete edited diagrams, repository layouts, filters, configuration, the workspace revision, bounded backups, and import hashes. Git schema JSON and internal clones remain in the existing file store. Another browser/profile or port connected to the same user state directory reads the same workspace. This does not synchronize screens in real time or share a workspace across computers; use JSON sharing for another computer.

Edits are batched for 16 ms, up to 1,000 actions per transaction. All edits share one workspace revision. A stale request, even for another diagram, receives HTTP 409 and stops subsequent writes in that client. Failed or uncertain writes are not automatically replayed. Export unsaved screen data as ChartDB JSON and reload. Required write failures roll back the transaction and its revision.

## Automatic upgrade from browser storage

1. Upgrade KeepERD while retaining the existing address/port. Each browser/profile with old data must visit its original address once. An unopened profile's IndexedDB cannot be read by another browser or the local server.
2. The app reads the `ChartDB` IndexedDB database without upgrading its version or changing/deleting originals. It collects every saved diagram and its tables, relationships, dependencies, custom types, Areas, notes, filters, configuration, repository layouts, and legacy backups. Relevant localStorage backups are read too. Old v1 layout migration backups restore a coherent table/Area/note set. Version 2 layouts include positions for tables absent from currently saved branches.
3. For the same diagram ID, the latest saved **complete ERD** wins by `updatedAt`. The initial browser edit takes precedence over an unedited server schema snapshot. For already edited server data, a strictly newer browser timestamp wins; equal timestamps retain the server. Tables, references, and deletions travel together. No duplicate migration ERD, manual choice, or success notification is created. If the saved browser `v2:` Sync revision differs from the current server revision, keep the latest Git schema and merge browser positions/Areas/notes instead of restoring an obsolete schema. The complete browser ERD is also backed up. Matching or absent revision markers retain the complete browser edit. A later new Git revision uses the normal schema Sync merge.
4. Repository layouts follow the corresponding diagrams' saved edit time, rather than the currently opened branch or arrival order. Layout-only table positions are retained. Configuration has no historical edit timestamp and is imported only when server configuration is absent. Filters follow the accepted ERD, including deletion. If a repository layout has no corresponding diagram timestamp, existing positions win and missing positions are filled.
5. Different replaced/rejected diagram versions are saved as `migration` backups, subject to retention limits. Import hashes prevent repeated imports and prevent already imported deleted diagrams/filters from reappearing. Required failures roll back data and import hashes together. The next visit retries migration; existing server ERDs can still open. An IndexedDB open blocked for more than two seconds reports a warning. Originals remain available.

Historical tables have **no per-table edit timestamp**, so the saved ERD timestamp is the available ordering signal. This does not reconstruct the true past order when a browser clock was wrong or an older Sync updated `updatedAt`. It does not merge same-named tables across different ERD IDs independently. New server saves record edit times; Git Sync preserves those user edit times. Unsaved changes in an old open tab are not migration inputs. Close old-version tabs before using the upgraded app.

To recover a conflicting complete diagram, find a backup with `kind: "migration"` in `/api/workspace` and save the `value` from `/api/workspace?backup=<id>` as JSON. Import it through the normal ChartDB JSON flow. This is a recovery operation, not a required upgrade step. The limited backup history is not permanent.

## Backup limits and failures

Sync and whole-diagram/layout replacement attempt a backup before replacing primary data. Ordinary dragging does not create a complete backup on every movement. Migrated legacy backups use the same policy:

- At most **3 backups per ERD**, **128 total**, and **32 MiB of UTF-8 payload**.
- Oldest backups are pruned first. A single payload exceeding 32 MiB is skipped with a warning.
- Backup insertion/pruning uses an isolated savepoint. Backup errors do not block primary editing or schema import; failure of a primary write still fails the operation and rolls it back.
- These limits describe JSON payloads, not the physical SQLite/index/WAL size. Deleted rows leave reusable pages, so the file need not shrink immediately. Diagrams and import hashes are not subject to the backup payload cap.

A full disk can still prevent primary writes. A GET that cannot import a new schema returns the last saved ERD with a warning when one exists; POST remains a failure. Free space, preserve unsaved screen changes, and reload. Same-disk automatic backups do not replace exported/offline backups.

## Offline backup and recovery

Stop the server normally, then copy the **whole user state directory** elsewhere. Copying only the live SQLite file can omit recent WAL transactions. To preserve an unclean shutdown, retain `keeperd.sqlite`, `keeperd.sqlite-wal`, and `keeperd.sqlite-shm` together.

Restore while the server is stopped, after preserving the current state separately, then restart with the same Node runtime. Complete edited ERDs can also be exported as ChartDB JSON; repository layout/Area/note sharing uses the work-data JSON flow. Sync result JSON is not a backup of the latest edited workspace.

Library deletion affects every browser sharing the server. SQLite and schema files do not share a transaction: on partial deletion failure, refresh the list and retry the remaining items. Selected deletion also attempts cleanup of legacy browser originals; browser cleanup failure does not undo server deletion.
