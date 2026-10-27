# Resumable career run

Store sessions outside the checkout at `DATA/sessions/<skill>-<id>.json`. A new operation gets a new ID; daily child phases reference the same `runId` and parent session. Update through a temporary sibling and rename, retaining the previous revision when recovering an interrupted write. Keep other owners' sessions intact.

```json
{
  "schemaVersion": 1,
  "skill": "daily-flow",
  "sessionId": "unique-session-id",
  "runId": "unique-run-id",
  "revision": 1,
  "status": "in_progress",
  "updatedAt": "ISO-8601 timestamp",
  "canonicalRevision": 0,
  "inputs": [],
  "sourceRegistry": "absolute private registry path",
  "factsPath": "absolute private facts ledger path",
  "selectedRecordIds": [],
  "changedRecordIds": [],
  "phases": [],
  "sourceCheckpoints": [],
  "materialArchives": [],
  "completed": [],
  "openQuestions": [],
  "blockers": [],
  "evidence": [],
  "outputs": [],
  "approvals": [],
  "exportVerification": null,
  "nextAction": "One concrete next action"
}
```

This is private workflow metadata, not a schema to post as new API fields. Existing sessions remain readable: add the applicable fields without discarding their completed work or source coverage.

The live app reads durable runs, questions, steering, sources, facts and materials through `../docs/WORKSPACE-CONTROL.md`. Use `npm run workspace -- state` at startup and before a dependent action. Publish phase changes/check-ins with a stable owner ID, save exact unresolved questions for an in-app answer, and consume pending app instructions only within existing authorization. Use `import-session` with the selected private JSON file to bridge legacy progress; inspect the result and continue updating supported workspace records. Keep detailed notes and original files private. A saved session alone does not update the live app, and pending steering does not automatically start an external agent.

Use `in_progress`, `waiting_for_user`, `complete` or `cancelled` for the operation. Each phase records its name, input/selected IDs, checked revision, result, changed IDs, outputs and unresolved dependencies. Source checkpoints record source, scope, checkedAt, actual checkedThrough, pagination cursor, complete/partial/unavailable coverage and blocker. Preserve a source's last successful checkpoint when a later scan fails. Completion of a bounded phase does not claim complete source history.

Evidence entries identify observation, source/path/version/date, provenance (`employer`, `user_report`, `artifact`, `hypothesis`, or agent/bot source as applicable), ownership uncertainty and the fact/application supported. Approval entries quote or accurately summarize the actual user instruction, date and exact scope; evidence observation and external wording approval remain separate.

A question has a stable ID, supporting artifact, the missing fact, dependent record/action and answer status. A blocker identifies the affected phase/role, reason, source and next recovery action. Continue independent work while that dependency waits. Material archive references identify opportunity, private attemptKey, final archive path/hash, receipt reference and coverage from `docs/WORKFLOW-CONTRACTS.md`.

At resume, use an explicit session/run ID or parent handoff first; otherwise select the latest matching unfinished operation for the user's request and owner. Read fresh settings, approvals, grants, claims and records, reconcile changed revisions and reuse answered questions. State the selected next action in one line. Common startup runs once for this resumed run; each submission still rechecks current authorization and lease.

Before handoff, read back changed records and save exportVerification (checkedAt, path, generation, careerRevision, current/pending/error) separately. For request changes, also record the user's correction, affected files/records, previous/current revisions and validation. Mark complete only when the requested bounded work and its checks are done; retain unrelated historical gaps explicitly. Report submissions, source coverage and export independently, with one next action.
