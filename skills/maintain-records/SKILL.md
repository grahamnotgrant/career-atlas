---
name: maintain-records
description: Sync employer events, recover submitted-material associations, or refresh changed work evidence within authorized sources.
---

# Maintain records

Read `../SESSION.md`, `../stop-slop/SKILL.md` and `../../docs/WORKFLOW-CONTRACTS.md`. Reuse Common startup and source checkpoints from `../../docs/AGENT-START.md`; child phases do not recursively restart startup. This workflow does not submit applications.

**Inputs:** authorized sources/coverage, canonical applications/opportunities, relevant private receipts/forms/materials, source registry and selected run/record IDs.

Select the requested branches: **employer sync**, **historical material recovery**, and/or **work-evidence refresh**. A daily run reuses their phase results; it does not promise full historical recovery on each pass.

1. Search the selected sources since their actual successful checkpoints with overlap. Read full relevant messages/records; retain pagination and distinguish acknowledged submissions, invitations, scheduled/completed interviews, decisions and unrelated material. Completion: every source has an accurate checked window/cursor or an unavailable/partial blocker.
2. Match application/job identity using requisition/ATS URL, application ID or an established source thread; use company/title/location/dates as supporting context. Preserve supported aliases and prior user-confirmed matches. Completion: each proposed change has a unique identity and source, or an unresolved question; company-only guesses remain unchanged.
3. Save a concrete employer-update plan, review it against fresh canonical records as the agent and apply supported commands. Use `npm run decisions -- apply` for clear decisions and the documented event/offer/history workflows otherwise. A matching employer acknowledgment can establish a missing historical submission with unknown date; generic sourcing cannot. Completion: successful changed IDs read back, per-entry failures preserved and newer evidence retained.
4. For material recovery, audit both preparation fields and application/receipt evidence using the Materials contract. Use `npm run resumes -- propose` for candidates, then inspect original sources and recompute full hashes. Apply exact-source/unique-full-hash, temporally consistent repairs under authorized maintenance; ask about filename/variant/company-only evidence, contradictions or replacements. Preserve DOCX/manual-text identity and unsupported format limitations. Completion: linked files have a saved proof basis and readback, or a sourced recovery item; empty fields are not described as lost evidence.
5. Record employer-stated application limits through `company-policy` with the source. Tidy/re-screen queue records only from supported changes, preserving user decisions and other owners' work. Report 30-day silence as stale, not rejected/closed. Completion: affected policies/roles retain accurate provenance and unknowns.
6. For work-evidence refresh, invoke `../uncover-evidence/SKILL.md` incremental mode on authorized changed sources. Inspect artifacts before asking a focused ownership/result question, and keep pending external claims separate from approved application material. Completion: source observations, new candidate facts and their question/wording status are saved without blocking unrelated work.
7. Verify changed records and export under the shared App and verification contract. Completion: before/after counts, coverage, changed IDs, missing evidence, pending questions and one next action are saved in the parent or standalone session.

**Outputs:** reviewed/applied plans, evidence and material proof bases, candidate facts/questions, per-source checkpoints, changed IDs and separate record/export verification.

**Approval gates:** The shared Permissions contract authorizes clear source-backed maintenance under a sync/daily request. The agent reviews those plans; ask only for unresolved identity/material/ownership, contradictions, replacements or changed external scope/claims.

**Completion checks:** each write has source and identity support; scheduled and completed events remain distinct; recovered material has file-specific proof; actual source coverage and unsupported operations remain visible; no outcome follows from silence; totals and exports are verified separately.
