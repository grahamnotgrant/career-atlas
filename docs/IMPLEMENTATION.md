# Implementation notes

React and TypeScript render the interface. Custom SVG Bezier paths connect recorded stages to individual application endpoints. Motion animates scene transitions and incoming paths. Node/Fastify serves local assets and APIs. SQLite persists application, event and evidence records, saved views, navigation history and command receipts. PDF.js renders managed PDFs using a locally bundled worker.

Reference documentation:

- [Node SQLite](https://nodejs.org/api/sqlite.html)
- [Fastify server](https://fastify.dev/docs/latest/Reference/Server/)
- [Motion SVG animation](https://motion.dev/docs/react-svg-animation)
- [PDF.js examples](https://mozilla.github.io/pdf.js/examples/)
- [Playwright local web server](https://playwright.dev/docs/test-webserver)

## Source watcher

An optional private configuration enables read-only polling of a Markdown submission ledger. The first scan establishes a baseline. Later new rows require a stable file read and a matching explicit confirmation receipt before importing. Historical rows and updates to existing outcomes are not reconciled by this watcher. Missing or ambiguous confirmation evidence leaves a row pending review; source errors retain the last valid dataset. Server-sent events publish imports without replacing the selected view.

## Current boundaries

Unclassified interviews remain in the evidence timeline rather than receiving an invented stage. Imports validate IDs, references, files and hashes before database mutation. Database changes run in one transaction; failed imports may leave unreferenced artifacts and a manifest for inspection, but do not partially publish records. Schema migration backs up the database before changing tables.

SQLite access is synchronous. This milestone targets small evidence samples. Full historical reconciliation, large-cohort geometry and the 2,000-application/20,000-event performance acceptance remain pending.

Private acceptance data and its audit trail live outside the checkout. Bundled browser code makes no external network requests. External evidence URLs remain plain text in this milestone. Documents with managed files open inside the app.

## Scene library and resume location

The local catalog supplies city matching, geographic coordinates and SVG landmarks. D3 Geo projects locally bundled World Atlas land; Motion drives the globe approach and city camera. The server derives home-location metadata from PDF contact headers, preserving evidence IDs and explicit conflict/unreadable/unset states. See SCENES.md for behavior and limitations.
