# Start, resume or change the search

Use this entry point without prior chat history. Read repository `AGENTS.md` first. Work in this checkout with the user's existing private data directory; do not create a second database to resume a search.

## Choose the starting path

| User request                                         | Path            |
| ---------------------------------------------------- | --------------- |
| First setup, onboarding, choosing roles              | Onboard         |
| Continue applying, check updates, refresh the sheet  | Resume and sync |
| Change preferences, correct a record, change the app | Request changes |

An agent started outside this repository must be given its checkout path and told to read `AGENTS.md`. These files do not install themselves into unrelated agents or grant account access.

## Common startup

1. Resolve the configured data directory and server URL. Follow `ONBOARDING.md` for a new installation and `OPERATIONS.md` for an existing one. Run `npm run atlas -- doctor`. Start the existing workspace when needed; never use the demo command on personal records.
2. Run `npm run career -- state`. Read the relevant private session under `DATA/sessions/`, current preferences, template approvals, grants, claims and uncertain attempts. Read only records needed for the task; keep tokens and bulk personal data out of messages.
3. Inventory available authorized sources: application ledger, receipts, resume files, employer portals, email and calendar. Record unavailable sources explicitly. A configured ledger watcher is not an inbox or calendar connector.
4. Select the path below. Reuse answered onboarding questions and existing authorization within its scope. If a required fact is missing, ask one focused question and continue independent work.

## Onboard

Follow `ONBOARDING.md` and `skills/discover-direction/SKILL.md`.

- Establish desired duties, exclusions, compensation basis and floor, locations, work arrangements and the history period to import.
- Read the user's supplied resumes and source evidence. Distinguish a home location from work-location requirements. A remote role may still require a particular city, state, country or time zone; preserve the employer's wording and whether it is required, preferred or unknown.
- Inventory existing applications before scouting. Separate reviewed roles from confirmed submissions and retain uncertain records.
- Save evidence-backed role families and preferences through the documented API. Unsupported structured fields belong in sourced private notes until the schema supports them; do not invent API fields.
- Continue through resume critique, evidence gathering and role-template skills. A new or changed resume template needs approval of that exact version. Onboarding itself does not authorize applications.
- Save the session with completed decisions, unresolved questions and one next action. Finish with the sync verification below.

## Resume and sync

Run this at startup, before applying after an interruption, and before handing work off. Read `skills/maintain-records/SKILL.md` for the maintenance steps. A request to sync authorizes clear, evidence-backed record updates within scope; review the plan as the agent and ask only about unresolved ambiguity or actions outside that authorization.

1. Read the last successful checkpoint for each source from the private session. Search authorized email/calendar/portal sources for changes since that checkpoint with an overlap to catch late or moved records. On a first run, use the user's chosen history period. Never advance a checkpoint beyond the period actually checked; preserve pagination cursors when a scan is incomplete.
2. Read full relevant messages and employer records. Match by application/job identity, with company, original title, location and dates as supporting evidence. Investigate title or location differences: preserve supported aliases and prior user-confirmed matches. Leave competing or conflicting matches unresolved rather than creating duplicates. Preserve source IDs and event dates separately from the time checked. Invitations, booked interviews, completed interviews and decisions are different events. Silence is not a rejection.
3. Save evidence outside the checkout. Use `CAREER-CONTROL.md` for record commands and `history-reconciliation.md` for reviewed historical repairs. Preserve existing events and evidence when adding a correction; do not replace an application with a stale copy. Read a fresh revision and reconcile conflicts before retrying. An uncertain command retries with its saved request ID.
4. Reconcile interrupted submissions before another attempt. Follow `skills/run-search/SKILL.md` for exclusive claims, preparation, submission and receipts. Each agent owns only its own claims. Do not release another agent's live work or overwrite its session.
5. After each confirmed submission, preserve the exact resume/answers and receipt, write the canonical record, then verify it by reading it back. A historical resume is linked as submitted only when evidence identifies that file. Missing files stay explicitly unlinked.
6. Verify the export as described below. Save checked-through dates, source cursors, added/updated application IDs, missing evidence and the next action. Report a partial sync when a required source could not be checked.

### Verify the app and sheet

The database is authoritative. Never separately edit the workbook to keep it synchronized.

- Read back the changed records through the API. The running app receives canonical changes through its event stream.
- The running server checks for export changes every five seconds. Read `DATA/exports/workbook-status.json`: require a successful export whose data `generation` and `career_state` revision include your writes. A newer concurrent write may move the target; record which revision you verified. View-only revisions need not match.
- If export is delayed or failed, inspect `doctor` and follow `OPERATIONS.md`. `npm run operations -- excel` can create an explicit export; verify its returned revisions and path. Do not undo a successful submission because an export failed.
- Save the verified workbook path in the session. An already-open Excel file is a snapshot; open the latest exported file to see updates. Background syncing requires the local server to be running.
- Mark record synchronization and workbook export separately. Do not say the inbox, calendar, database and workbook are all current when only one was checked.

## Request changes

Treat the user's explicit correction as direction to act within its scope. Do not ask them to approve the same change again. Classify it before writing:

| Change                                             | Handling                                                                                                                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pay, locations, role types, exclusions             | Read current settings, preserve untouched fields and write the requested change with provenance. Re-screen affected queued roles before submission.                           |
| Resume claims or positioning                       | Create a new immutable template version; preserve old submitted files. Obtain approval when the wording/version has not already been approved.                                |
| Application stage, date, outcome or identity       | Find supporting evidence or retain the correction as a user report. Preserve conflicting sources and unknowns; do not turn a scheduled interview into a completed one.        |
| Stop, pause or narrow application scope            | Apply the relevant grant change before further submissions. Recheck active claims and prepared roles. Broader preferences do not broaden an existing authorization grant.     |
| Globe, satellite, animations or other app behavior | Record the requested behavior and acceptance checks, then follow repository implementation/testing instructions. Product changes must not silently alter application history. |

Save a private `request-changes` session using `skills/SESSION.md`: the user's request, affected record IDs or files, previous/current revisions, work completed, validation and unresolved questions. If the request is ambiguous, ask one specific question before dependent edits. Keep other agents' unrelated work intact.

Finish record changes with read-back and export verification. Finish software changes with relevant checks and an accurate account of what was tested. Resume unfinished work from the saved session rather than rediscovering the request.

## Prompts that work in a fresh conversation

- “Read AGENTS.md in this Career Atlas checkout and onboard me using docs/AGENT-START.md. Reuse anything already saved.”
- “Read AGENTS.md, resume and sync authorized sources, reconcile outcomes, and verify the latest spreadsheet export. Save anything you could not check.”
- “Read AGENTS.md and follow Request changes in docs/AGENT-START.md. My change is: …”

These instructions support an agent when it runs. They do not create a scheduled inbox check or authorize messages, applications or account access.
