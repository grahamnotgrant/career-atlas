# Local control contract v1

Bind to loopback. A browser opens `/api/session` to receive an HttpOnly, SameSite=Strict cookie. Local clients read `control-token` from the private data directory and send `Authorization: Bearer <token>`. Do not expose this service through a tunnel or reverse proxy.

- `GET /api/health`: public runtime health, no private records.
- `GET /api/snapshot`: applications, view state, generation, coverage, `canGoBack` and source `sync` status.
- `POST /api/commands`: mutate view state using the command below.
- `GET /api/events`: authenticated server-sent snapshots after state/import changes, plus source `sync` events.
- `GET /api/evidence/:id/file`: managed file by evidence ID; validates its hash before streaming.

Command shape:

```json
{
  "id": "unique-command-id",
  "expectedRevision": 0,
  "action": "select",
  "payload": { "id": "demo-0" }
}
```

Actions: `location {city: sceneId|null}`, `document {id: evidenceId}`, `back {}`, `close {}`, `select {id: string|null}`, `theme {theme, locked?}`, `motion {enabled}`, `filter {status?, query?}`, `list {enabled}`, `flow {ids: string[] | null}`, `reset {}`. Theme values come from `sceneIds` in `shared/locations.ts`. The UI offers only applied locations plus Overview; the local API can preview the complete catalog. Status values: all, pending, interview, rejected, closed, offer.

A successful command returns `{view, generation, canGoBack}`. Repeating the identical command ID returns its original receipt. Reusing the ID with changed arguments returns 409. A stale expected revision returns 409 and changes nothing. Read the latest snapshot before deciding whether to issue a new command. Validation failures return 400; unknown application or evidence returns 404.

Selecting an application always follows its location. Legacy `locked` arguments are accepted for compatibility but no longer lock the scene. A filter clears selection. Reset clears filters and selection while preserving the motion preference. Acknowledgment proves server state; rendered appearance requires browser verification.

Imports run through the local CLI, not an arbitrary-path HTTP endpoint. Keep demo and private imports in separate directories. All clients share one view in this milestone; separate viewer sessions are a future extension.

Document selection requires evidence belonging to the selected application. Back restores persisted navigation history. Close dismisses the popup without opening a browser tab.

Snapshots include `homeLocation` with status, city label, coordinates and resume evidence IDs. This reports conservative contact-header extraction, not independent address verification.

The location command atomically sets the persistent city cohort and its scene, clearing transient selection, search and flow state. Null restores all locations. The theme command changes scenery and clears the city cohort. Popup navigation preserves the cohort.
