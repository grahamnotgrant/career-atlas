---
name: uncover-evidence
description: Probe personal ownership and technical or operational details without inflating experience, and record them in a facts file.
---

# Uncover evidence

Read `../SESSION.md` and `../stop-slop/SKILL.md`. During onboarding this is the main conversation: it should be thorough and a little relentless, because the resume rarely shows what the person actually built, decided or owned.

**Inputs:** the current resume, the user's stated goals, relevant artifacts, prior answers and the existing facts file if one exists.

Suggest voice first, as an option: this conversation goes better spoken than typed, because people explain their own work in more detail out loud. If the user has any voice or dictation tool (an assistant's voice mode, a dictation app, a recorded note), invite them to talk through each topic and paste or transcribe the result; the agent writes the facts from it. Typing is fine when they prefer it. Never require a voice tool.

1. Walk the resume top to bottom, most recent first. For each role, project or claim, ask the user to describe a specific instance: the initial problem, constraints, what they personally decided and did, who else was involved, what failed, how they verified it and what resulted. Ask one follow-up at a time and keep going until the account holds up.
2. Ask beyond the resume: side projects, things taught, processes changed, tools built for themselves, work they are proud of that never made it onto a page.
3. Inspect authorized artifacts where available. Repository code proves that code exists; it does not alone prove the user's authorship, enterprise rollout or customer adoption.
4. Record the user's exact scope and distinguish personal work from team work. Separate measured outcomes from estimates and aspirations. Where a number is remembered rather than sourced, record it as the user's recollection.
5. Write the facts file at `DATA/evidence/facts.md` (create or extend; never delete entries): one entry per fact with what they owned or built, when, the scope, any metric with its source or "user recollection", and the artifacts or messages that support it. Templates and applications cite these entries, and `stop-slop` checks claims against them.
6. Draft a defensible resume bullet and a short interview story for the strongest facts. Read them back for factual correction.

**Outputs:** the facts file with source IDs and ownership boundaries, unresolved gaps, approved wording and a resumable session.

**Approval gates:** The user confirms new factual claims before they enter the facts file as confirmed; unconfirmed ones stay marked as hypotheses. Voice is suggested, never required.

**Completion checks:** Each fact has an actor, action, scope, date and supported result; implementation details withstand follow-up; no invented numbers; user corrections preserved; the facts file is the source every later claim points to. Respect requests to skip or stop and save the next question.
