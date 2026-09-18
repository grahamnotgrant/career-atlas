# Career record control

Use the same private `CAREER_FLOW_DATA` and `CAREER_FLOW_URL` as the server. View commands and record commands have separate revisions.

```sh
npm run career -- state
npm run career -- settings @/absolute/private/settings-payload.json
npm run career -- retry /absolute/private/requests/saved-command-id.json
```

The career CLI reads the token without printing it. For mutations it reads the current career revision, saves the exact request under private `requests/`, then sends it. If transport fails, retry the saved request. Do not create another ID for a mutation whose outcome is unknown. A stale revision response means nothing changed; read current records, reconcile changes and send a new request only if still appropriate.

## HTTP contract

`GET /api/career` returns the current career state. `POST /api/career/commands` accepts:

```json
{
  "id": "unique-command-id",
  "expectedRevision": 3,
  "action": "claim",
  "payload": {
    "opportunityId": "job-123",
    "owner": "agent-a",
    "grantId": "approved-batch",
    "leaseSeconds": 300
  }
}
```

A success returns `{revision, result}`. The claim result contains `opportunityId`, `owner`, `fence`, `expiresAt` and `grantId`. Save those values. Identical command retries return the original result; changed content under the same ID is rejected. HTTP 409 means a revision or workflow conflict. HTTP 400 means invalid input. Read `shared/career.ts` and `server/career.ts` for exact validation rules.

All requests require the local bearer token or the browser's same-origin session. The token is a local credential, not an application authorization grant. Do not paste it in chat or expose the endpoint through a tunnel.

## Actions

| Action             | Payload                                                              | Effect                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `settings`         | `{settings}`                                                         | Replace editable preferences with a validated settings object. Preserve fields the user did not change.                                                                  |
| `families`         | `{families}`                                                         | Save up to 20 unique ranked, evidence-backed families. Cannot remove a family in use or rename an authorized family.                                                     |
| `opportunities`    | `{opportunities}`                                                    | Upsert discovered/prepared/blocked records, or source-backed historical attempted/uncertain records. Never manufacture confirmed state.                                  |
| `template`         | `{template}`                                                         | Add an immutable template ID/version, initially unapproved.                                                                                                              |
| `approve-template` | `{id, approvalNote}`                                                 | Record the user's approval of that exact saved template.                                                                                                                 |
| `grant`            | `{grant}`                                                            | Record a user-approved scope, expiry, compensation floor, locations, exclusions and maximum applications.                                                                |
| `grant-state`      | `{id, status}`                                                       | Set active, paused or revoked. Revocation is permanent.                                                                                                                  |
| `claim`            | `{opportunityId, owner, grantId, leaseSeconds?}`                     | Acquire an exclusive eligible application lease.                                                                                                                         |
| `renew`            | `{opportunityId, owner, fence, leaseSeconds?}`                       | Extend an unexpired claim before submission; owner, fence and active authorization must still match.                                                                     |
| `prepare`          | `{opportunityId, owner, fence, templateId, materialHashes, answers}` | Record tailored material hashes and answers from an approved matching template.                                                                                          |
| `begin-submit`     | `{opportunityId, owner, fence}`                                      | Recheck the claim, active grant, cap, role boundaries, description and preserved materials; mark attempted. Call immediately before the external action.                 |
| `result`           | `{opportunityId, owner, fence, outcome, detail}`                     | Record blocked or uncertain after an attempt and expire its lease. Never treat uncertainty as a safe retry.                                                              |
| `release`          | `{opportunityId, owner, fence}`                                      | Expire an owned claim.                                                                                                                                                   |
| `confirm`          | `{opportunityId, application}`                                       | Register an observed historical or current submission with receipt evidence and a submission event. This records evidence; it does not authorize an external submission. |
| `reconcile`        | `{opportunityId, notSubmitted:true, evidence, source}`               | Resolve an uncertain/interrupted attempt only after evidence shows it was not submitted.                                                                                 |
| `annotate`         | `{opportunityId, roleFamilyId?, provenance, offer?}`                 | Append provenance, map a family or record offer details.                                                                                                                 |
| `triage`           | `{opportunityId, triage: {tier, score?, reason, decidedAt}}`         | Sort a discovered role: `review` waits for the user in the Queue, `auto` may proceed under an active grant, `skip` is set aside. Agents never set the decision.          |
| `decide`           | `{opportunityId, decision: approved\|skipped, note?}`                | The user's decision on a review-tier role, from the Queue tab or this API on the user's instruction. Appends user provenance.                                            |

A lease lasts 30–900 seconds (300 default). Renew before expiry during preparation. If it expires, stop external actions and re-read the role. A new claim increments the fence, invalidating older agents. `begin-submit` reserves an attempt against the grant cap; an uncertain attempt cannot be claimed again without reconciliation. A expired claim after an external submission does not justify retrying the employer form: preserve the receipt and reconcile through `confirm`.

## Preserving materials

`prepare` requires full SHA-256 hashes whose exact bytes exist at `DATA/artifacts/<sha256>`. Preserve material files before preparing. Do not use filenames or partial hashes as proof. Hash and copy a local user-approved artifact with a small filesystem script; keep source documents outside the checkout. Record its source path, approved template and wording checks in the private session.

`confirm.application` uses the complete `Application` schema in `shared/model.ts`. Company and original title must match the opportunity. Its submission event must reference nonempty receipt evidence. Set unknown submission dates to `null`. Evidence may reference already managed `sha256` artifacts; the API rejects arbitrary `file` paths. The manifest importer can stage files, but importing a confirmed application also creates its canonical confirmed opportunity, so reconcile identity before combining import and confirm routes.

Provenance kinds are `employer`, `user`, `hypothesis` and `source`. Do not record an agent explanation as employer feedback. Approval notes must quote or summarize a real user instruction with the scope and date, not a suggested approval.

## View and exports

```sh
npm run control -- location '{"city":"nyc"}'
npm run control -- role '{"id":"family-id"}'
npm run control -- flow '{"ids":["application-id"]}'
npm run control -- select '{"id":"application-id"}'
npm run control -- reset '{}'
npm run operations -- excel
npm run atlas -- doctor
```

View commands use the view revision and never authorize applications. See `CONTROL.md`. The workbook status records exported revisions; use fresh canonical records when it lags. Export and restore details are in `OPERATIONS.md`.

## Recording employer decisions

A rejection or a closed role is recorded against the confirmed application, not the opportunity. An agent using authorized sources writes a plan and checks its evidence and application identity against fresh records. A user request to sync or maintain records authorizes clear updates within that scope. Resolve ambiguous matches or conflicting decisions before applying; do not ask for repeated approval of an already-authorized update. Follow `skills/maintain-records/SKILL.md`, then:

```sh
npm run decisions -- apply /private/decisions.json
```

Each entry names the application, the decision (`rejected` or `closed`), the date of the employer's message, a `source` (for example a mail thread reference) and the message `text`. The message is stored as `feedback` evidence, a `decision` event cites it, and the status changes. An application that is already decided is skipped unless the entry sets `force`. Silence is never a decision; after 30 days it is shown as stale, which is a different thing.
