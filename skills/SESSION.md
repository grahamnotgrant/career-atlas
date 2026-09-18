# Resumable skill session

Store one JSON file per session at `DATA/sessions/<skill>-<id>.json`, outside the checkout. Create a new file for a new session. Write a temporary sibling then rename it when updating; keep the previous revision when recovering from an interrupted write.

```json
{
  "schemaVersion": 1,
  "skill": "discover-direction",
  "sessionId": "a-unique-id",
  "revision": 1,
  "status": "in_progress",
  "updatedAt": "ISO-8601 timestamp",
  "canonicalRevision": 0,
  "inputs": [],
  "completed": [],
  "openQuestions": [],
  "evidence": [],
  "outputs": [],
  "approvals": [],
  "nextAction": "One concrete next action"
}
```

Use `in_progress`, `waiting_for_user`, `complete` or `cancelled`. Evidence entries include a local path or source ID, the claim supported, provenance (`employer`, `user_report`, `artifact`, `hypothesis`) and any uncertainty. Approval entries include the user's actual instruction, date and exact scope. Never infer approval from elapsed time or an agent's draft.

Before resuming: load this file, read fresh canonical settings and records, compare revisions, and reconcile changed inputs or revoked approvals. Tell the user the next action in one sentence. Do not ask answered questions again unless the answer is missing, conflicting or outdated. Save after each resolved question or produced artifact. Mark complete only after the skill's checks pass.

For startup, synchronization and changes, follow `docs/AGENT-START.md`. Extend the session with `sourceCheckpoints` (source, checkedAt, checkedThrough, cursor, complete/partial/unavailable, blocker), `changedRecordIds`, and `exportVerification` (checkedAt, path, generation, careerRevision, current/pending/error). Save only checkpoints actually verified. For `request-changes` sessions also retain the user's request, affected records/files, previous revision and validation. Keep these fields private; use separate sessions for separate agents.
