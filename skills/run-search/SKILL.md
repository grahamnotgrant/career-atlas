---
name: run-search
description: Scout, screen, claim, tailor and submit within explicit authorization; preserve uncertain outcomes.
---

# Run the search

Read `../SESSION.md`, `../stop-slop/SKILL.md`, repository `AGENTS.md` and the current career-control API documentation.

Run Resume and sync in `docs/AGENT-START.md` at startup and handoff. Verify each canonical submission by read-back, retain source checkpoints, and verify the workbook export includes the saved data revision. Record unavailable sources and failed exports separately from application outcomes.

**Inputs:** current preferences, approved templates, authorization grant, tracker, sources and available tools.

1. Read fresh records before scouting or claiming. Capture employer, original title, canonical job URL, full description, location, compensation and source date. Screen duties against evidence and constraints. Preserve discovered and rejected-for-fit records without counting them as applications.
2. Normalize employer/job identity and check company history. Distinct jobs at the same company are separate records; duplicate source listings of one job are not. Store the role as an opportunity and `triage` it: `review` when it deserves the user's eyes, `auto` when it fits an active grant, `skip` otherwise.
3. Verify a user authorization grant covers the role, pay, location and exclusions. Claim the eligible job through the API. Retain owner, expiry and fencing token. If another agent owns it, choose another job.
4. Read the full description. Tailor a resume and answers from approved templates. Preserve exact files, hashes and source mappings. Check facts, extraction, reading order and writing.
5. Immediately before submission, re-read authorization and claim state. Obtain missing sensitive answers from the user. Use the available browser to fill and verify the employer form. If CAPTCHA blocks completion, save progress and ask the user to complete that step.
6. Submit only within the grant. Capture ATS confirmation or employer acknowledgment. Record the exact resume, answers and receipt. If a timeout leaves the outcome uncertain, record uncertainty and reconcile the employer surface or inbox before retrying.
7. Release or complete the claim through the API. Renew an in-progress claim before expiry. A lost or expired claim requires reacquisition and reconciliation, not a blind retry.
8. Reconcile outcomes through authorized sources. Keep employer feedback separate from explanations inferred by the agent.

**Outputs:** discovered/screened records; tailored materials; prepared, attempted, blocked, uncertain or confirmed states; receipt-backed events; claim and session state.

**Approval gates:** Explicit individual or bounded batch application authorization; approved template; user input for sensitive/unsupported answers. Pause or revocation stops further external submissions.

**Completion checks:** Each confirmed submission has a receipt; counts exclude discoveries and drafts; exact materials preserved; claims settled; blockers have one next action. One agent may perform all steps sequentially; delegate only when authorized and supported.
