# Career workflow contracts

AGENTS.md owns policy and routing. This reference defines the shared permission, material, evidence and handoff checks used by the workflows. Read the sections needed for the selected operation. The procedures use supported career commands and the live records in [WORKSPACE-CONTROL.md](WORKSPACE-CONTROL.md); private archive/ledger conventions do not add fields to the career API. No workflow starts a scheduled service implicitly.

## Permissions

A user request and saved authorization define the work scope. Reuse that authorization until its scope changes or it expires or is revoked. A daily run coordinates existing permissions; it does not create a grant.

| Operation                                                           | Proceed within the authorized request                                                                                                                              | Ask when                                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Discover and triage roles                                           | Store source-backed opportunities under current preferences                                                                                                        | A required preference is missing or contradictory                                                                            |
| Sync employer records                                               | Agent reviews a saved identity/evidence plan, applies clear acknowledgments, events and decisions, then reads back                                                 | Competing identities, conflicting decisions or a proposed forced replacement remain unresolved                               |
| Repair historical resume links                                      | Agent reviews a saved plan with exact application identity, a contemporaneous source identifying that file and a unique full SHA-256 match, then verifies the link | Evidence is filename/variant/company-only, dates conflict, bytes differ, or an existing link would be replaced               |
| Discover work evidence                                              | Read configured authorized sources; store observations and candidate facts with ownership uncertainty                                                              | A source is outside the authorized scope or a material fact needs personal clarification                                     |
| Tailor application material                                         | Reuse approved claims; adjust emphasis and wording without adding claims or materially changing positioning                                                        | New claims, metrics, credentials or material positioning need exact wording approval                                         |
| Submit applications                                                 | Valid individual/batch grant, approved matching template, current exclusive claim, passing vetting and preserved final materials                                   | The role lacks authorization, a sensitive/unsupported answer is needed, or an applicable browser/tool gate requires the user |
| Send recruiter messages, schedule meetings, start timed assessments | Only under authorization for that action                                                                                                                           | A daily/apply invocation alone is the only instruction                                                                       |

An unsupported answer is a question, not a value copied from a plausible default. A blocker stops its dependent role/action; continue independent authorized work. Preserve user holds, skips and revocations. A discovered role is not a submission, and silence remains awaiting response. Resolve an uncertain submission before retrying it.

Renew an owned lease before `begin-submit` when needed; `renew` refuses after an attempt. `result` and `release` require an unexpired lease. If an external action outlasts it, preserve the outcome evidence and actual canonical `attempted` state in the session (and source `annotate` provenance when supported). A receipt can establish `confirm` after expiry; proof of non-submission can establish `reconcile`. Absence of a receipt alone proves neither non-submission nor permission to retry. A naturally expired claim is not a successful `result` write.

Submitted material identity, user confirmation of a fact, approval of external wording and application authorization are separate decisions. A source can establish that an artifact exists without establishing the user's personal contribution or permission to use a claim externally. Follow tool-specific action-time requirements even when a grant covers the application.

## Materials

Maintain one immutable final archive for each application attempt, with stable private `attemptKey`, opportunity ID, employer/requisition identity and source references. The key is private workflow metadata, not a new career API field. Reuse it when reconciling an interrupted attempt.

Before `begin-submit`, reconcile this inventory against the final populated employer form:

| Item           | Required record and check                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role           | Employer, original title, job/requisition ID where available, canonical employer URL, full posting, source and capture time                                 |
| Resume         | Exact uploaded bytes or exact manually entered resume text, media type, full hash and evidence identifying it as the submitted material                     |
| Lineage        | Approved template ID/version for a new application; historical bespoke lineage stays unknown unless established                                             |
| Questions      | Original prompt, field/type or stable form identifier, exact final answer/selection, and whether answered, intentionally blank, declined or uncaptured      |
| Extra material | Every cover letter, written response, portfolio link and other upload, with role, exact content/bytes, media type, hash where applicable and source mapping |
| Final form     | Saved populated form/snapshot and field-by-field comparison with the inventory, with discrepancies resolved before submission                               |
| Result         | Separate receipt/employer acknowledgment, source/event time and the attempt/archive it establishes; uncertain and blocked results remain distinct           |

Keep archives, snapshots and files outside the checkout, normally in `DATA/materials/<opportunityId>/<attemptKey>/`. Stage exact bytes in `DATA/artifacts/<sha256>` for `prepare`; record the archive hash alongside uploaded-material hashes. An archive lists attachment hashes; its own hash is recorded externally, avoiding a self-reference. Preserve the receipt separately after submission rather than changing the final archive bytes. Save extraction/render/reading-order findings for resume files using the tools available.

For each new attempt, publish its typed `material` records through WORKSPACE-CONTROL.md alongside the private archive: every upload, supplementary link, exact question/answer inventory and final archive must retain role, exact opportunity/attempt identity, original/derivative reference, hash where applicable, source and honest coverage. Read back these records and `prepare` before `begin-submit`; a failed inventory publication blocks that submission until recovered. Add the resulting receipt as a separate immutable record for the same attempt. Historical recovery publishes only source-established inventory and gaps; it must not infer old answers or uploaded bytes from today's material. A private archive alone does not populate the live material view.

The current `prepare` API accepts an unlabeled hash array and an `answers` string up to 20,000 characters. The archive supplies the material roles and complete question inventory. If the inventory exceeds the API field, keep the full archive and put its full hash/reference plus an accurate summary in `answers`; never truncate the source. Add the archive as managed `note` evidence with `text/plain` media type when confirming, so the canonical record references it. Read back the actual links and hashes, not only a command acknowledgment.

Current resume linking proposes PDFs, and managed evidence declares PDF or plain text. Preserve original DOCX/other uploads privately, hash them, and link a plain-text material manifest recording their identity and location through the supported evidence workflow. A converted PDF is a derivative, not proof it was uploaded. Record unsupported rendering/format support explicitly; do not invent API properties. Use `CAREER-CONTROL.md` and `history-reconciliation.md` for supported writes. Historical enrichment without a safe supported update stays a sourced recovery item rather than a direct SQLite patch.

### Coverage and recovery

Join applications to opportunities by `applicationId`. Inspect opportunity preparation fields, application evidence, managed artifacts and referenced original receipts/forms before labeling information missing. Preserve detailed coverage in the private archive/session and publish material coverage through WORKSPACE-CONTROL.md: `verified`, `recovery-needed` (source present but recovery needed), `ambiguous`, `unavailable` or `not-applicable`. Retain the original source basis; these labels do not establish a submission.

A missing `templateId` is not a missing resume. A saved file hash proves intact bytes, not that those bytes were submitted. Compare original upload/receipt evidence and temporal consistency before linking: a later version with an older filename is not an exact historical match. Group exact-file comparisons by full hash and retain the basis for every association. Keep template ancestry separate.

A receipt-backed historical submission stays confirmed even when its archive is incomplete. Do not guess historical answers from today's profile, substitute a current resume, or erase a supported outcome to make completeness checks pass.

## Sources and facts

Evidence discovery has two branches: a full experience conversation and an incremental refresh of work completed since a source checkpoint. Reuse `skills/uncover-evidence/SKILL.md` for both. Search evidence first, then ask one focused question about the missing decision, ownership, result or metric. Continue independent work while an answer is pending.

### Resolve the evidence location

Read canonical `settings.evidence`, prior sessions and any existing source registry. The default facts ledger is `DATA/evidence/facts.md`; an existing evidence pointer can name a resume/source document rather than a facts ledger. Inspect and preserve that source before choosing the facts location. Record the selected `factsPath` and old source references in a private `DATA/evidence/sources.json` registry and the session; reconcile duplicate/conflicting ledgers instead of silently creating a competing store. Missing evidence setup is a recovery item, not grounds to discard existing approved templates or restart answered onboarding.

The detailed authorization registry remains a private file maintained by the agent. Publish corresponding live source checkpoints through WORKSPACE-CONTROL.md, referencing the same source IDs; this is not a bundled external connector. Each source entry records ID, kind, bounded path/repository/channel/account scope, the user's authorization reference, and checkpoint/cursor. Existing sessions may supply these entries; reference one registry rather than copying it per daily phase. Record unavailable sources and the actual checked window. A configured file watcher is not proof of inbox, Slack or calendar coverage.

### Look beyond the resume

Within the configured scope, inspect relevant repositories and Git history, GitHub issues/PRs/reviews (including CodeRabbit/Codex review threads and finding dispositions), selected Slack channels/threads, project plans, decision/acceptance receipts, evaluations and user-supplied artifacts. Retired skills and archived meeting notes can establish historical process; current instructions govern any execution. Use connectors where available and record authentication gaps instead of changing account access silently. Unrelated accounts, channels and personal folders remain outside the scan.

Look for problem definition, planning, work decomposition, agent routing, review disagreements, failure diagnosis, acceptance criteria, manual verification, rollout/adoption and release judgment. Trace problem → decision → implementation/delegation → review → observed result. Describe actor and outcome accurately: repository code proves existence; a merged PR does not prove deployment or use. A bot comment or a comment under the user's account does not alone prove the user authored it.

### Fact and wording records

Each append-only fact entry has a stable ID, observation, actor/personal contribution, scope, date or unknown date, result, source links/versions and unresolved questions. Distinguish:

- Evidence observed, including agent/bot output and its source account.
- Personal ownership: supported, user-reported, disputed or unanswered.
- Result: draft, implemented, merged, deployed, used, measured or unknown as supported.
- Exact external wording and its approval reference, separate from evidence collection.

Keep detailed append-only source notes in the ledger and publish relevant facts, questions and exact wording decisions through WORKSPACE-CONTROL.md, referencing the same stable IDs. A directly observed artifact with unanswered ownership is an observation plus a question, not a fabricated human claim. Preserve user corrections and superseded assertions with their sources and workspace audit history. Estimates/recollections retain that provenance. Build candidate resume bullets or interview stories from the supported scope and obtain approval for new external claims. Agent-assisted orchestration, architecture, specification, acceptance and release work must not become invented unaided implementation, tenure or customer outcomes.

## App and verification

For a foreground start/daily run, verify the configured server with `npm run atlas -- doctor`; start the existing workspace when needed and open its URL in the user's available browser/app panel. Provide a clickable link. Verify a loaded workspace and, when showing a result, the selected application/material. An HTTP 200 or queued panel request alone is not proof the user sees it. Keep tokens out of URLs. Background work preserves the user's current selection: the current app has one shared view.

Read back changed career records through the API. Verify exported data generation and career revision separately using `DATA/exports/workbook-status.json`; follow `OPERATIONS.md` for errors or explicit export. View-only revisions need not match. Save which revision was verified if concurrent work advances the target. A file already open in Excel is a snapshot.

The Work screen shows persistent questions, agent check-ins, pending instructions, facts/wording approvals, material inventories, source coverage and authority. The journey, queue, outcome and document views remain available. Use `WORKSPACE-CONTROL.md` for supported records and commands; preserve original source files privately. A pending instruction awaits an external agent's acknowledgment; the app does not bundle a model or promise an unsupported connector or automatic wakeup.

## Phase handoff

Use `skills/SESSION.md` for one run record, referencing the source registry and archives. Each phase returns selected/changed IDs, actual source coverage, result, blockers with dependent actions, and outputs. A daily coordinator reuses those results rather than recursively repeating startup or historical scans. Fresh revisions, grants and leases still require checks at mutation/submission time.

A completed bounded phase may retain explicit partial/unavailable source coverage. It does not imply all history is reconciled. A blocked role does not stop unrelated roles. At handoff report confirmed, uncertain and blocked submissions separately, record sync and export separately, pending questions, and one next action. A proposed follow-up date does not schedule a reminder.
