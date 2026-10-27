---
name: scout-roles
description: Discover employer postings, assess duty-level fit and hand triaged opportunity IDs to the applier.
---

# Scout roles

Read `../SESSION.md`, `../stop-slop/SKILL.md` and `../../docs/WORKFLOW-CONTRACTS.md`. Reuse Common startup in `../../docs/AGENT-START.md`. Scouting records fit and sources; `../run-search/SKILL.md` owns claims and submissions.

**Inputs:** fresh preferences/families, supported experience and source map, current opportunities/history, private board list/checkpoint and run coverage.

1. Inspect existing queue/history and current evidence before discovery. Newly supported orchestration, workflow implementation or customer work can inform fit; an unapproved claim stays a candidate for external wording. Completion: missing coverage and the requested discovery window are explicit; absent application authorization is separate from role fit.
2. Read `DATA/scout/boards.json` and checkpoint. Seed on first use, then run `npm run scout -- poll` when a fresh poll is due/requested; reuse a result already checked in the parent run. The CLI uses one global cutoff and keeps it unchanged if any board fails, so retain failures and avoid claiming per-board advancement. Completion: board results, candidate file, window and failure coverage are saved.
3. Review kept postings against duties, evidence, compensation basis/floors, location eligibility and exclusions. Use `--days`, `--all-titles` or `--any-location` to investigate filter gaps when relevant. Missing pay/publish dates remain unknown. Completion: each retained candidate has a fit rationale; substantive mismatches are not rescued by pay or AI keywords.
4. Store candidates through `npm run scout -- store <file>` with canonical employer URL, identity, full description and source date. Deduplicate against existing applications/opportunities and source evidence, including receipts whose structured URL may be blank. Completion: stored canonical IDs and unresolved competing identities are explicit; no discoveries become submissions.
5. Use `triage`: `top` for an in-scope strong fit or high pay, `standard` for other eligible discoveries and `skip` for a substantive preference mismatch. Record company limits, pay uncertainty, holds and grant eligibility separately; a missing/expired grant alone is not poor fit. Completion: each stored role has a sourced tier/reason without clearing a user hold or skip.
6. Expand sources when coverage is missing or the request calls for broader discovery: use `probe`, a supplied company list or `discover --hn` with the user's source exclusions. Employer boards are canonical; aggregators are leads. Verify moved/closed boards before removal. Completion: additions/removals or the reason expansion was unnecessary are saved, without displacing ready authorized work every run.
7. Hand off specific opportunity IDs, posting/source references, fit reasons and submission blockers. Read back stored/triaged records and verify export when data changed. Completion: the applier can select eligible roles without repeating discovery or guessing evidence coverage.

**Outputs:** candidate file, opportunity IDs, source coverage/checkpoint, triage rationale, board changes and applier handoff.

**Approval gates:** Public/authorized discovery and triage require no application grant. Submission authorization remains the applier's separate check; new external claims and unsupported personal facts follow the shared contract.

**Completion checks:** stored roles retain employer identity/URL/posting with actual source dates or explicit unknowns; duty-level evidence and pay/location checks are visible; no duplicate/confirmed state is invented; global checkpoint failures remain accurately recorded; handoff IDs and blockers are actionable.
