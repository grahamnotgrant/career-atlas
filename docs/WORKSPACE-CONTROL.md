# Agent workspace control

The local workspace protocol makes agent progress and the person's direction durable. It complements career commands: it never submits an application or grants new application authority.

Use `npm run workspace -- capabilities` to inspect supported operations and protocol version, then `npm run workspace -- state` for records and revision. Set `CAREER_FLOW_URL` for a different loopback port and use the same `CAREER_FLOW_DATA` directory as the server. The CLI reads the local control token without printing it.

```sh
CAREER_FLOW_AGENT_ID=daily-agent npm run workspace -- state
CAREER_FLOW_AGENT_ID=daily-agent npm run workspace -- run @/absolute/private/run.json
CAREER_FLOW_AGENT_ID=daily-agent npm run workspace -- import-session @/absolute/private/session.json
CAREER_FLOW_AGENT_ID=person npm run workspace -- steer '{"instruction":"Prioritize portfolio-based roles"}'
npm run workspace -- retry /absolute/private/requests/saved-request.json
```

Every mutation is archived in the private requests directory before delivery. Retry an uncertain delivery with the saved request ID; creating a second ID is a new operation. A conflict requires reading the latest state and reviewing the proposed change, rather than forcing a stale value.

Use `actor=person` only for the person's actual direction or decision in chat. Agent-originated progress and acknowledgment use the agent's owner ID. Actor/channel are attribution, not a substitute for source authorization or exact wording approval.

| Action                        | Payload                                                                                                                            | Meaning                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `run`                         | `{run:{id,operation,label,owner,status,phase?,nextAction?}}`                                                                       | Create or refresh an owned run; omitted prior outputs remain intact                               |
| `question`                    | `{question:{id,prompt,runId?,kind?,options?,support?}}`                                                                            | Save the exact question; an existing identity cannot change its prompt/support                    |
| `answer` / `dismiss-question` | `{id,answer}` / `{id,reason}`                                                                                                      | Record the person's resolution without approving external wording                                 |
| `steer`                       | `{instruction,runId?,recordIds?}`                                                                                                  | Save a pending person instruction                                                                 |
| `steering-state`              | `{id,status,message}`                                                                                                              | Handling agent acknowledges, completes or fails delivery                                          |
| `source`                      | `{source:{id,label,kind,scope,authorizationRef,coverage,checkedAt,...}}`                                                           | Record actual checked scope; retain the last successful checkpoint separately                     |
| `fact`                        | `{fact:{id,label,observation,contribution,ownership,outcome,support,wording}}`                                                     | Store a full observation/contribution record; changed evidence invalidates prior wording approval |
| `approve-fact`                | `{id,wording}`                                                                                                                     | Person approves the exact supported wording, separate from a template or application grant        |
| `material`                    | `{material:{id,opportunityId?,applicationId?,attemptKey,label,role,mediaType,sha256?,reference?,originalId?,coverage,questions?}}` | Immutable attempt inventory; a new version needs a new ID                                         |
| `import-session`              | `{session}`                                                                                                                        | Preserve a selected legacy session as a run; repeated imports retain newer answers and progress   |

Timestamp fields use UTC ISO-8601 strings. Command schemas and limits are in `shared/workspace.ts`. The CLI wraps the raw JSON file in `{session:...}` for `import-session`; other action files contain their full action payload. `GET /api/workspace/history?after=0&limit=100` provides paginated audit events for superseded observations/decisions (maximum 200 per request).

## Shared control

The app and CLI use `/api/workspace/commands` with request ID, expected revision, actor, channel, action and payload. App actions record the person as actor; external agents use their stable owner ID via `CAREER_FLOW_AGENT_ID`. These labels record attribution, not additional access or application permissions. The existing local control token protects the endpoint.

A steering request is an instruction awaiting delivery. An agent reads the pending queue on start/resume, acknowledges only requests it takes responsibility for, performs authorized work, then records completion or failure. Acknowledgment alone is not completion. No cloud model, cross-chat messaging or automatic agent wakeup is assumed. When an agent is disconnected, the app keeps the request pending.

Agents must reconcile app holds, skips, answers and authority changes before their next dependent action. Recheck application grants and claims immediately before submission through the existing career workflow. Pausing an authorization prevents later authorized submissions; it cannot cancel a form already sent to an employer.

## Evidence and completeness

Questions, supported observations, personal ownership, wording approval and application authority remain separate. An answer does not approve a resume claim. A fact record must cite its source and accurately distinguish personal contribution from team/tool work. New external wording needs the person's approval.

Materials belong to an exact opportunity and attempt. Preserve role, media type, hash, source, original/derivative identity, exact questions/answers and coverage. Retain unsupported original formats privately; a text manifest or PDF preview does not prove that derivative was uploaded. Existing managed evidence previews support PDF/plain text. A confirmed historical submission can still have incomplete material coverage.

Source checkpoints report the actual authorized scope and checked window. A failed or partial scan retains its last successful checkpoint. App connection, source coverage and workbook export health are separate signals.

## Recovery and portability

Existing private sessions remain useful as detailed workflow notes. Import them explicitly, inspect the resulting run/questions and resolve conflicting owners or answers rather than replacing newer durable work. Import is an initial bridge; the agent must continue publishing progress to the workspace protocol.

Workspace records live in the same SQLite database and are included in full JSON export and backup/restore. Workbook exports include revision-stamped workspace tables. Original files outside the managed artifact directory remain external references; backup cannot make them portable automatically. Review the references and restore limitations before moving a workspace.

See [workflow contracts](WORKFLOW-CONTRACTS.md), [career commands](CAREER-CONTROL.md), [operations](OPERATIONS.md) and the [workspace roadmap](WORKSPACE-ROADMAP.md).
