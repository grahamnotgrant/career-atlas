# Career Atlas

The existing Career Flow prototype is the foundation for Career Atlas. The complete product expansion is tracked in [implementation issue #1](https://github.com/grahamnotgrant/career-atlas/issues/1), labeled `ocean` for routing. The specification describes planned capabilities; the current implementation status is below.

Explore your job search as a local, interactive flow. Click an application to inspect its timeline and evidence. Change the view through the browser or a documented local command interface.

## Status

Stop 1 of three feedback milestones. This version includes a working flow canvas, outcome filters, search, evidence popups with Back and local PDF previews, location scenes, saved views, managed document storage and assistant control. Complete reconciliation, historical playback, offer comparison, practice workflows and portable backup/restore remain planned. Do not use a partial import to infer whole-search conversion rates.

## Run

Requires Node.js 24 or later and npm. Tested with Node 26 on macOS; other OS support remains unverified.

```sh
npm ci
npm run build
npm run demo
npm start
```

Open http://127.0.0.1:4317. The demo contains 14 fictional applications. Use a separate data directory for private records:

```sh
CAREER_FLOW_DATA=/absolute/private/folder npm run import -- /absolute/path/manifest.json
CAREER_FLOW_DATA=/absolute/private/folder npm start
```

Set `PORT` if 4317 is occupied. The app fails with a clear message rather than terminating an existing process. Stop the foreground server with Ctrl-C. `/api/health` reports whether the server is running. Run imports against this version's manifest schema in `shared/model.ts`; full historical reconciliation remains in the next milestone.

## Your files

Default data locations:

- macOS: `~/Library/Application Support/career-flow`
- Linux: `$XDG_DATA_HOME/career-flow`, or `~/.local/share/career-flow`
- Windows: `%LOCALAPPDATA%/career-flow`

SQLite stores records, events, evidence metadata, saved views, import history and command receipts. Managed evidence copies live in `artifacts/` by SHA-256. `imports/` retains source manifests. Original files remain untouched. Browser storage holds no authoritative data. Source manifests may contain private source paths; keep this entire data directory private.

Core operation uses local assets and the loopback server. Initial dependency installation requires network access. No model service, cloud database, telemetry or remote fonts are configured. Source receipts may link to external services, which require connectivity when opened.

Do not copy an active SQLite database as a backup. Portable backup/restore is planned for the next milestones. Preserve the complete data directory with the server stopped until then.

## Control from any assistant

```sh
npm run control -- state
npm run control -- select '{"id":"demo-0"}'
npm run control -- theme '{"theme":"nyc","locked":true}'
npm run control -- filter '{"status":"rejected"}'
npm run control -- reset '{}'
```

Set `CAREER_FLOW_DATA` to the same directory as the server. Set `CAREER_FLOW_URL` if using a different port. See [the control contract](docs/CONTROL.md). The CLI reads the local write token without printing it. Codex is optional; any local tool can invoke this interface.

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Public tests use synthetic fixtures in temporary directories. Browser tests start an isolated server on port 4399 and preserve failure traces under ignored `test-results/`. Private screenshots and real acceptance evidence belong outside this repository. Test setup never imports private data.

## Open-source preparation

The intended distribution is open source. License selection and third-party notices are pending the release milestone; nothing has been published. Keep personal records, private screenshots, credentials and private scope documents out of the repository.

## Watch a submission ledger

In a private data directory, create `source-watch.json`:

```json
{
  "ledgerPath": "/absolute/private/path/APPLICATIONS.md",
  "year": 2026,
  "intervalMs": 2000
}
```

The first scan records a baseline. Subsequent new rows under `## Submitted` need a matching explicit confirmation receipt in the ledger's `receipts/` directory. The watcher reads source files without modifying them, waits for changes to settle and publishes verified additions to the open scene. Its status appears in the app. It does not reconcile historical rows or changes to existing interview/outcome records. Unconfirmed additions remain pending review.

## Background scenes

Overview and Remote show a shaded globe centered on the home location in readable resume contact headers. Selecting a city zooms toward it and introduces its landmark scene. The dropdown includes only locations in imported applications. The library includes 16 cities; see [scene behavior and contribution guide](docs/SCENES.md). All art and globe data load locally.
