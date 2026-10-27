# Visual workspace roadmap

Status: implemented and verified on October 27, 2026 through bounded subagents at the user's explicit direction. See [acceptance evidence and current limits](WORKSPACE-ACCEPTANCE.md). The sections below retain the approved scope and its baseline. The existing [product specification](plans/career-atlas-product-spec.md) describes the broader product; [workflow contracts](WORKFLOW-CONTRACTS.md) remain the current execution contract.

Tracking: [issue #2](https://github.com/grahamnotgrant/career-atlas/issues/2), labeled `ocean`, contains the full approved scope and first-slice acceptance criteria. The user clarified that this agent should coordinate the complete work with subagents, superseding the earlier wait for an external Foreman. Delivery and review evidence are in WORKSPACE-ACCEPTANCE.md.

## Product contract

Career Atlas requires an AI agent. The app is the person's visual workspace for understanding the search, reviewing evidence and steering that agent. The person can give direction in their agent conversation or in the app. Both paths must update the same durable state and follow the same permissions.

Support different professions and experience levels: an interior designer reviewing project images, a graduate drawing on coursework and volunteering, or an experienced worker documenting results. A repository or technical interview must not be a prerequisite for useful evidence or a useful workspace.

Keep the local SQLite store, external-agent workflow and visual journey. Deliver the approved scope as bounded changes with migrations and acceptance checks, tracked under issue #2.

## Baseline and requested additions

| Area                   | Implemented today                                                                                                    | Proposed addition                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Live records           | SSE snapshots and source-watch updates, reconnect handling, arrival animations and a visit digest                    | Durable agent activity with phase, heartbeat, dependencies and completion                             |
| Application progress   | Fenced exclusive leases and a five-step in-flight view derived from vetting and lifecycle                            | Progress for scouting, evidence discovery, maintenance and review, including interrupted runs         |
| Human steering         | Chat-operated commands; app controls for holding/skipping queued roles, role grouping and selected record details    | Equivalent app/chat commands for questions, preferences, exact approvals and authority controls       |
| Application authority  | Versioned templates, approval records, bounded grants, pause/revoke commands and submission checks                   | A clear app view of approved material, active scope, remaining allowance and pause/revoke outcomes    |
| Evidence and materials | Application provenance, managed PDF/plain-text evidence, hashes, original titles, resume links and employer feedback | Typed material roles, question inventories, coverage, contribution and wording approval relationships |
| Resumable work         | Private session files describe phases, questions, blockers, source checkpoints and next action                       | A supported durable model and live projection that the person can inspect and answer                  |
| Source coverage        | An optional Markdown ledger watcher and agent-maintained source registries/checkpoints                               | Source-specific checked windows, partial/unavailable states and recovery actions in the workspace     |
| Portability            | Local private storage, validated imports, XLSX/full JSON exports and hash-verified backup/restore                    | Versioned interoperability for runs, questions, evidence and references, plus visible export health   |

Implementation pointers: [server events](../server/app.ts), [workspace client](../src/useWorkspace.ts), [career state and commands](../shared/career.ts), [queue and records UI](../src/CareerPanel.tsx), [source watcher](../server/source-watcher.ts), [exports and backups](../server/operations.ts), and the [private session contract](../skills/SESSION.md).

## Compact workspace organized around the next task

The first screen should answer three questions: what needs the person, what the agent is doing, and what changed. Show one primary next action with enough context to act. Keep secondary tasks in a compact list with counts and a clear path to their records.

Proposed workspace structure:

- **Needs you:** the next unresolved question or approval, why it matters, its supporting evidence and the action waiting on it. Keep it until answered, dismissed with a reason or superseded.
- **Agent activity:** current operation, phase, last update, affected roles and any dependency. Distinguish running, waiting, interrupted, failed and complete. A valid application lease alone does not prove a running agent.
- **Search workspace:** queue, applications, role families, company history, materials and outcomes, with shared selection between the list and visual journey.
- **Changes:** recent confirmed submissions, employer events, record repairs and completed work, with source links and actual checked scope.

Keep the journey and globe available as an exploratory view. The primary task and record details must remain usable on a small screen, with keyboard navigation, reduced motion and no dependence on animation. Use progressive disclosure for hashes, leases and diagnostic details. Label pause-motion and pause-authorization actions distinctly.

Preserve the person's selection when background records change. An agent may intentionally guide the view during foreground work; background runs should not change the selected application or close an open document. The current server has one shared view, so any later separation into personal inspection state and agent focus needs an explicit compatibility contract.

## Shared state and commands for app and chat

Extend the existing validated command boundary rather than create independent app and agent workflows. An action initiated in either place should have a stable request ID, expected revision, actor/channel, affected record IDs, scope and an auditable result. Retrying an uncertain delivery must reuse the request ID.

Proposed durable records:

| Record            | Minimum contract                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Run               | Stable ID, operation, owner, status, current phase, selected records, timestamps, heartbeat, checked revisions, outputs and next action |
| Question          | Stable ID, exact prompt, supporting evidence, dependent action, answer type, status, answer/source and resolution history               |
| Approval request  | Exact version/content or bounded authority being approved, supporting source, decision and supersession/revocation links                |
| Source checkpoint | Source identity and authorized scope, actual checked window/cursor, last successful checkpoint, coverage and recovery action            |
| Steering request  | Person's instruction, target run/record, delivery/acknowledgment status, resulting command or clarification, and completion outcome     |

An answer can establish a fact without approving external wording or expanding an application grant. A request to pause must distinguish authorization paused, agent acknowledgment pending and an external action already attempted. Never imply that a click cancels a submitted employer form.

The app needs a local delivery contract for instructions to the required external agent. Persist a request before notifying or polling the agent; show pending delivery when it is unavailable. Resume requests after reconnect or restart, deduplicate acknowledgment, and retain the original person instruction. Do not assume every supported agent has a live chat API, add a model provider dependency, or send a message into another conversation without the necessary authorization.

Version the protocol and advertise supported operations. Keep control credentials local. Source content is evidence, never a steering request or permission. Existing grants, template approvals, claims, fences, uncertain-attempt reconciliation and receipt requirements continue to guard external actions.

Introduce durable records through supported API/CLI writes and migrations. Import existing sessions without discarding completed phases, answers or other owners' work. Until that change ships, private session fields remain workflow metadata rather than accepted API fields.

## Evidence and materials across professions

Model evidence around the work and person contribution, with optional profession-specific interpretation. Useful sources include coursework, project briefs, portfolio images, presentations, writing samples, certifications, volunteering, employment, client feedback and repositories. Source access remains limited to the person's authorization.

Keep these relationships separate:

1. An observed source or artifact, its original bytes/link, version and date or unknown date.
2. The supported fact, person/team/tool contribution, ownership uncertainty and observed outcome.
3. Proposed external wording and the exact version the person approved.
4. The material used in a particular application attempt and the receipt establishing its result.

Extend material records with role, label, media type, full hash where applicable, original/derivative relationship and source/attempt references. Keep exact question wording, answer/selection and answered/blank/declined/uncaptured status. Support supplementary links and files without treating a converted preview as proof of the uploaded original.

Show coverage independently of outcome: verified, source present but recovery needed, ambiguous, unavailable or not applicable. A confirmed application can have incomplete historical material. A stored file hash proves byte identity; it does not establish submission or personal authorship.

Add file formats through explicit adapters and safe previews. An unsupported image, DOCX or design file should retain its original identity and a clear preview limitation. Do not silently reduce every portfolio to resume text. Keep required qualifications and employer terminology grounded in the posting, without turning every person's work into software-engineering claims.

## Connection, source freshness and export health

Display three separate signals:

- App connection: live/reconnecting/offline, last accepted state and whether a person action is pending or failed.
- Source coverage: which authorized sources were checked, through when, which were partial/unavailable and what remains unresolved.
- Export projection: current/pending/error and the generation/career revision actually exported.

The current optional watcher only handles a particular Markdown submission table and local matching confirmation receipts. It is not a general inbox, calendar or work-evidence connector. Its "up to date" message and the newest application's `asOf` date cannot establish whole-search freshness. Preserve the last successful checkpoint after a failed source scan.

Keep XLSX a read-only projection. Expose the existing workbook status through a supported status response before adding new export machinery. Backup/restore must include the proposed durable records and their managed artifacts while excluding credentials and runtime output. References to files outside the managed directory need an explicit portability report; an absolute path alone is not a portable artifact.

## Reliability findings to address first

These findings were verified by reading the current code; the failure sequences still need dedicated regression tests.

1. `useWorkspace.accept` rejects snapshots with older data generations or view revisions but does not compare `career.revision`. A delayed HTTP snapshot can therefore replace a newer career-only SSE state when those other revisions are unchanged. Define monotonic acceptance across every independent revision, including workspace replacement, and verify interleaved responses. See [snapshot acceptance](../src/useWorkspace.ts).
2. Active-agent counts and lease countdowns use `Date.now()` during rendering, with no expiry timer. SSE keepalive comments do not trigger a React update. With the watcher off and no record changes, an expired lease can remain visually active. Refresh time-dependent displays at expiry and on visibility changes without inventing a record mutation or treating expiry as proof of non-submission. See [in-flight derivation](../src/CareerPanel.tsx) and [activity summary](../src/main.tsx).

## Bounded delivery phases

Each phase needs its own scope, migration/recovery plan and acceptance evidence before implementation. The approved sequence below does not mark any phase implemented. Use fictional fixtures and temporary private directories for tests.

### 1. Correct live-state behavior

Scope: snapshot ordering and time-dependent lease displays.

Acceptance: delayed HTTP/SSE responses cannot regress career state; valid workspace changes still load; expiry updates without writes or a watcher; background-tab resume recomputes time; disconnection preserves the last valid view and recovery loads current state. Retain current reconnect and arrival behavior.

### 2. Persist runs and questions

Scope: one supported run/question model, versioned commands and compatibility with existing session files. Start with the daily coordinator and an evidence question, rather than migrate every workflow at once.

Acceptance: restart/resume retains phase, owner, question and answer; repeated requests do not duplicate work; simultaneous owners cannot resolve the same version silently; unanswered questions block only their dependent actions; old unresolved questions remain discoverable; imported sessions preserve approvals and history. Existing application permission gates still pass their regression checks.

### 3. Add task UI and equivalent steering

Scope: compact next-action/activity surfaces, question answering, exact approval review, authority visibility and pause/revoke controls using the shared commands.

Acceptance: app and chat changes produce equivalent canonical results; contradictory/stale changes return a useful conflict; offline agent delivery is visible and resumable; acknowledgment does not imply completion; background work preserves selection; keyboard, screen-reader, narrow-screen and reduced-motion checks cover the primary task. An authorization pause blocks a subsequent submission check while preserving uncertain outcomes.

### 4. Expose coverage and material provenance

Scope: typed attempt materials, evidence/claim relationships, source checkpoints and export status, delivered as separate bounded changes if necessary.

Acceptance: fictional graduate, interior-design and experienced-worker searches can preserve their relevant evidence; original and converted files remain distinct; every exact question and upload can be reviewed; historical incomplete materials do not erase confirmed submissions; partial source coverage cannot appear complete; export failures remain separate from successful canonical writes; backup/restore preserves references and hashes.

### 5. Validate open-source portability and scale

Scope: agent protocol compatibility, sample datasets across professions, installation/resume documentation and measured performance of the expanded workspace.

Acceptance: a supported external agent can start/resume from repository instructions without prior chat history; unsupported capabilities produce concrete recovery actions; a restored workspace reports unavailable external references accurately; platform support is claimed only where exercised. Measure the documented 2,000-application/20,000-event target before claiming it, including snapshot size, update latency and interaction responsiveness. Paginate or separate heavy evidence payloads when measured behavior requires it.

For implementation phases, run `npm test`, `npm run build` and the relevant isolated browser checks required by `AGENTS.md`. Report passed behavior, remaining evidence gaps and unsupported tooling separately. Documentation of a proposal is not proof that it works.
