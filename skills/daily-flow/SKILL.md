---
name: daily-flow
description: Coordinate the daily career run through evidence refresh, queue work and applications within existing grants.
---

# Daily career flow

Read `../SESSION.md`, `../stop-slop/SKILL.md`, repository `AGENTS.md` and `../../docs/WORKFLOW-CONTRACTS.md`. This coordinates existing workflows in one resumable run. It is not a scheduler, a new grant or permission for recruiter outreach.

**Inputs:** current user request, prior run, configured workspace and authorized sources, preferences, approved templates/claims, grants, queue, claims and uncertain attempts.

Follow SESSION.md's live workspace protocol throughout the run: reconcile app instructions/answers, publish each phase/check-in and persistent question, and update actual source coverage. Finish with observed outcomes before marking a request complete. The person can steer through chat or the Work screen; both use the same durable records and existing authorization.

1. **Resume and show.** Complete Common startup in `../../docs/AGENT-START.md` once for the run. Reuse the matching unfinished run and completed prerequisites. Open/verify the app for a foreground daily request; background execution preserves the shared selection. Completion: run ID, route, revision, source registry, actual viewing status and unfinished dependencies are saved.
2. **Sync and reconcile.** Run `../maintain-records/SKILL.md` employer-sync and relevant material-recovery branches over source checkpoints with overlap. Prioritize new employer replies and uncertain attempts affecting today's roles. Completion: updated IDs/readbacks and actual coverage are saved; unresolved identities/materials stop only dependent work. Surface urgent pipeline/user actions without sending messages or starting assessments on implied permission.
3. **Refresh work evidence.** Run `../uncover-evidence/SKILL.md` incremental mode on configured work sources since their checkpoints. Inspect plans, repository/PR/review and Slack/acceptance evidence before asking one focused question about the most useful missing contribution/result. Completion: each source is checked, reused, genuinely empty or unavailable; candidate facts/questions and exact external wording approvals stay separate. Pending new claims do not stop applications using already approved claims.
4. **Work the queue and discover.** Inspect already eligible/vetted work, then use `../scout-roles/SKILL.md` for fresh discovery or coverage gaps, reusing a poll already completed this run. Save why discovery/source expansion was performed or unnecessary. Completion: selected opportunity IDs have current fit evidence, priority and separate submission eligibility/holds; the queue can proceed without repeated onboarding/scouting.
5. **Apply within grants.** Use `../run-search/SKILL.md` on eligible selected roles. Submit within existing valid grants, with approved claims and the final Materials archive, renewing claims and rechecking authorization per submission. A cap/expiry, unanswered sensitive question, required tool gate or uncertain outcome blocks that action; choose independent eligible work rather than ending the whole run. Completion: each selected role is confirmed with evidence, prepared/blocked with a reason, uncertain with a reconciliation action, or intentionally deferred with the dependency recorded. Grant exhaustion permits sync/discovery, not extra submissions.
6. **Verify and hand off.** Check only new relevant source changes since this run's initial sync, settle owned claims, read back changed career/material associations and verify export independently. Show the relevant result in a foreground run, preserving the view in background work. Completion: phase results, selected/changed IDs, archives, source windows/cursors, answered/pending questions, confirmed/uncertain/blocked counts and one next action are saved.

**Outputs:** one daily session with linked phase results, discovered/triaged roles, source-backed submissions within grants, experience candidates/questions, archive references and separate source/record/export verification.

**Approval gates:** Use WORKFLOW-CONTRACTS.md, Permissions. Daily invocation permits coordination and maintenance within the user's scope; eligible submissions use existing grants. New claims/positioning, expanded grants, unsupported/sensitive answers, outreach, meeting changes and timed assessments retain their relevant approval requirements.

**Completion checks:** startup and full source scans were not recursively repeated; source failures/cursors are honest; pending questions block dependent claims only; all attempted applications have an observed outcome and settled owned claim; exact materials/receipt identity and record/export results are verified independently. A finished bounded run can retain explicit historical recovery items; report those rather than claiming the entire search is reconciled.
