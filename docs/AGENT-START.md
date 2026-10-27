# Start, resume or change the search

Read repository `AGENTS.md`. Reuse the configured private data directory and workspace. The shared checks live in [WORKFLOW-CONTRACTS.md](WORKFLOW-CONTRACTS.md); do not duplicate approval rules in individual routes.

## Choose the starting path

Choose the user's current request first. Within that route, resume the matching unfinished operation before repeating completed setup. Use evidence-backed prerequisites, not an old `onboardingStep` alone, to determine whether onboarding is needed.

| Request                                                        | Route                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------- |
| First setup or unresolved direction/evidence/templates         | Onboard                                                 |
| Open/resume an established workspace                           | Common startup, show app, resume the selected operation |
| Check updates, receipts, records or spreadsheet                | Resume and sync                                         |
| Find roles or refresh the queue                                | Scout                                                   |
| Continue applications                                          | `skills/run-search/SKILL.md` on the eligible queue      |
| Review outcomes, fit or new work                               | Review                                                  |
| Change preferences, claims, history, authorization or software | Request changes                                         |
| Run the daily flow                                             | `skills/daily-flow/SKILL.md`                            |

Agents outside this checkout need its path and the authorized source scope; links do not grant account access.

## Common startup

Run once per new/resumed run, including a daily coordinator's child phases. Reuse its workspace/run/source references; refresh canonical state and authorization again when a mutation or submission needs it.

1. Resolve the configured data directory and URL. Use `ONBOARDING.md` for installation or `OPERATIONS.md` for an existing one. Run `npm run atlas -- doctor`; start the existing workspace if needed. Completion: correct private workspace and runtime status identified, without demo or second-database creation.
2. Run `npm run career -- state` and `npm run workspace -- state`. Read pending steering requests and answers, the matching private session, current preferences, template approvals, grants, owned claims and uncertain attempts. If multiple sessions fit, use the saved run/parent handoff and latest matching unfinished operation, preserving other owners' sessions. Import a selected legacy session explicitly when needed, then publish its ongoing phase, questions and source checkpoints through `WORKSPACE-CONTROL.md`. Completion: selected route, run ID, revisions and dependent blockers recorded.
3. Inventory authorized sources and resolve the facts ledger/source registry using WORKFLOW-CONTRACTS.md, Sources and facts. Reuse prior authorization and actual per-source windows/cursors. Completion: each needed source is scoped and available, partial or unavailable; unresolved evidence setup has a recovery action.
4. For foreground start/daily or a request to see results, follow WORKFLOW-CONTRACTS.md, App and verification: open the running workspace and verify it loaded. Background phases preserve the shared view. Completion: visible workspace verified or the concrete viewing blocker and URL reported.

## Onboard

Follow `ONBOARDING.md`: intake with `skills/discover-direction` steps 1–2, the full `skills/uncover-evidence` conversation, evidence-backed role-family approval, resume critique, approved templates and application authorization. Reuse already established facts and decisions.

Inventory existing applications before scouting, preserving submission identity and unknowns. Establish duties, exclusions, compensation basis/floors, locations, remote eligibility and work arrangements. Resolve the source registry and chosen facts ledger before creating a competing facts file. New work observations may be stored as candidates; exact external claims and template versions need approval. Save unfinished questions one at a time in the private session.

## Resume and sync

Use `skills/maintain-records/SKILL.md` without rerunning Common startup. An authorized sync covers clear source-backed maintenance through agent-reviewed plans under the shared Permissions contract.

- Search each source since its last successful checkpoint with overlap; retain incomplete pagination and actual checked windows. A first scan uses the user's chosen history scope.
- Match exact application/job identity before updates. Read full relevant evidence; retain aliases, unknown dates, contradictions and user-confirmed matches. Invitations, scheduled and completed interviews, and decisions are distinct events.
- Save evidence privately; use supported commands and fresh revisions. Retry an uncertain command using its saved request ID. Preserve newer events and other owners' claims.
- Resolve relevant uncertain submissions before another attempt. Repair material associations only under the shared full-hash/source/temporal checks; keep historical source-present gaps separate from truly unavailable material.
- Refresh changed work sources with `skills/uncover-evidence` incremental mode when within scope. An unanswered ownership question leaves its candidate pending while approved application work continues.

Completion: changed IDs read back, source coverage/questions saved, and export verified independently. Full historical recovery is a named task, not an implicit promise of every incremental run.

### Verify the app and sheet

Follow WORKFLOW-CONTRACTS.md, App and verification. Read changed records through the API, then require a successful `DATA/exports/workbook-status.json` whose data generation and career revision include the writes. View-only revisions need not match. Follow `OPERATIONS.md` when export lags/fails; keep successful record writes and export failures distinct. Save the verified path/revision. Reopen the latest workbook to view changes.

## Scout

Follow `skills/scout-roles/SKILL.md`. Store employer URL/posting/identity, triage fit, and hand off specific opportunity IDs with source coverage and submission blockers. Inspect existing eligible queue work before repeating discovery during a daily run. Source expansion is appropriate for missing coverage or explicit discovery requests; it need not displace ready applications every run.

## Review

Use `skills/review-and-improve/SKILL.md`. Resolve the requested snapshot/date range and coverage first; perform a bounded sync if current outcomes are needed and sources are authorized. Inspect application evidence as well as preparation fields. For a work/experience review, use incremental evidence discovery and targeted ownership questions. Preserve denominators, pending time and the original scope of employer feedback.

## Request changes

The user's explicit correction authorizes that correction within scope; reuse it rather than asking for the same direction again. Select the branch before dependent writes.

| Change                                                 | Handling                                                                                                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pay, locations, duties or exclusions                   | Preserve untouched settings, record provenance and re-screen affected queued roles. Preferences do not expand grants.                                                      |
| New resume claims/positioning                          | Gather sources, propose exact wording and a new immutable template version for approval; preserve submitted files.                                                         |
| Application identity, stage, date, outcome or material | Resolve evidence/identity and apply the shared Permissions and Materials rules. Retain conflicts and unknowns.                                                             |
| Stop, pause, narrow or expand authorization            | Apply supported grant changes before further submissions. Expansion requires user authorization; revoked grants remain revoked.                                            |
| Evidence or ownership correction                       | Append the user report/source and supersede contradicted assertions without rewriting historical approvals or submissions.                                                 |
| Missing city                                           | Use the `city` action in `CAREER-CONTROL.md` with sourced coordinates/aliases. Illustrated landmarks are product work.                                                     |
| Software/app behavior                                  | Record acceptance criteria, preserve career history and follow repository implementation checks. Route actual cross-system rewrites through the repository's ocean policy. |

Save a private `request-changes` session with affected IDs/files, prior/current revisions, work, validation and one next action. Finish record changes with readback/export verification and software changes with the relevant checks.

## Handoff

Use `skills/SESSION.md`: save phase results, source registry/checkpoints, selected/changed IDs, archive references, questions and blockers by dependent action. Report record synchronization, source coverage and workbook export independently. Provide one next action. A skill invocation does not create a scheduled monitor, grant additional accounts or authorize recruiter messages.
