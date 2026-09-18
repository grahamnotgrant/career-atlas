# Local operations

Run these commands from the software checkout with the same `CAREER_FLOW_DATA` used at setup. Node.js 24 or later is required.

```sh
npm run atlas -- start
npm run atlas -- doctor
npm run atlas -- stop
npm run operations -- excel
npm run operations -- json /absolute/new-export.json
npm run operations -- backup /absolute/new-backup-directory
npm run operations -- restore /absolute/new-data-directory /absolute/backup-directory
```

## Excel

The running server checks for canonical data changes every five seconds. It writes a new `.xlsx` and complete `.xlsx.json` companion under `exports/`. The workbook lists its export time, database schema and revisions. `exports/workbook-status.json` points to the current projection or records the last export error. `doctor` reports this status. The UI and agent workflow continue using SQLite if export fails.

The workbook starts with joined Search records, Role families, Resume templates, Event history, Evidence detail, Source notes and Offer terms sheets when those records exist. Family names, template versions and compensation amounts have readable columns. Raw tables follow for audit.

Exports have unique filenames, so an open workbook cannot block updates to a new export. Reopen the latest file from the status record to see changes. Excel edits do not change SQLite. Excel limits a cell to 32767 characters; the companion JSON retains full text. Strings beginning with `=` remain text, not spreadsheet formulas.

The exporter reads canonical tables inside a SQLite read transaction. The workbook and JSON derive from that same snapshot. A pending export may lag a newer mutation; compare its revisions with the current database before analysis. Keep exports only as long as needed; the app does not delete your prior exports.

## Backups and restore

Backups use SQLite `VACUUM INTO` for a consistent database snapshot while the app is running, then copy hash-verified, content-addressed evidence and other local user files. Pause agents editing mutable session/template files for a consistent copy of those files. The manifest contains SHA-256 hashes. Runtime tokens, database WAL/SHM files, logs, earlier backups and exports are omitted.

Backup and restore destinations must be new directories. Restore rejects unsafe paths, symlinks, mismatched hashes and database integrity errors. Failed restore removes its temporary directory and leaves existing data untouched. Hashes detect damage; they do not authenticate an untrusted backup source.

Stop the app before switching to restored data. Set `CAREER_FLOW_DATA` to the restored directory, run `doctor`, then start. The server generates a fresh control token. Review saved grants and claims before resuming an interrupted search, and never run both restored and original copies as competing application agents. Reconcile employer receipts for any submission that happened after the backup.

Operations use a private `.operations.lock` directory. An interrupted process may leave it behind. Inspect its `owner.json` and verify the owner has exited before removing the stale lock. Never remove a live operation's lock. A workbook export retries after the lock clears.

## Updates

Stop the app, preserve any code changes, fetch and review a trusted version, then run:

```sh
npm run atlas -- update TRUSTED_TAG_OR_COMMIT
npm run atlas -- start
```

The update command requires a clean checkout and a locally fetched Git reference. It backs up personal data outside the software checkout, switches to that exact commit, installs locked dependencies, builds and runs unit/integration tests. It leaves personal files in place. A failed update reports failure and preserves the backup; do not start it until resolved. Keep the previous commit ID if you need to return to it. A newer database schema may require restoration into a fresh directory when returning to older code.

`stop` uses an authenticated local endpoint and does not kill arbitrary processes. An older server without that endpoint must be stopped using the terminal or service that started it before its first upgrade. A blocked stop is a blocker; do not work around it with a broad process-kill command.

## Dependency note

Excel export uses [ExcelJS](https://github.com/exceljs/exceljs). The scoped `uuid` override pins its compatible CommonJS dependency to 11.1.1 to address the buffer-bounds advisory in older UUID releases. Export tests read back the produced XLSX and verify literal cell types.
