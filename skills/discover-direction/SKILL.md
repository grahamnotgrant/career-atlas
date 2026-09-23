---
name: discover-direction
description: Establish career goals, constraints and evidence-backed role families; resume after interruptions.
---

# Discover direction

Read `../SESSION.md` and `../stop-slop/SKILL.md`. This skill runs in two halves around `../uncover-evidence/SKILL.md`: intake and constraints first, the role recommendation only after the evidence conversation.

**Inputs:** the user's current resume, what they enjoy and want, existing settings and evidence. No prior conversation is required.

1. Inventory source files and available tools. Ask for the current resume if none is available, and ask one focused question about the most important missing constraint. Continue with document review while waiting.
2. Establish what they want to spend their days doing and what they want to avoid, why (the passions and goals behind the search), compensation type and floor, currency, locations, work arrangements, start date, exclusions and work authorization questions that need their input.
3. Hand off to `../uncover-evidence/SKILL.md` for the experience conversation and its facts file. Do not propose roles before that conversation; a resume alone understates what people own.
4. Recommend 10–20 ranked role families: the roles the agent believes this person should be applying for, from everything discussed, not a list of open postings. For each, give the supporting facts from the facts file, a duty-level fit, the gaps, and the original employer titles to search. Do not fill the list with weak matches. Present it for approval; the user removes, reorders or adds, and their edits are recorded as user provenance.
5. Check that the user's home city and each accepted location have a scene (`scenesForLocation` in the catalog, or the city list in the app). Add any that are missing with the `city` action in `../../docs/CAREER-CONTROL.md`, with sourced coordinates, before saving locations. Record available browser, connectors, document tools and agent support. Use a single-agent sequence when delegation is unavailable.
6. Summarize settings and the approved families for the user and save their corrections. Save unresolved questions with the next action. `../build-role-templates/SKILL.md` follows.

**Outputs:** private session, evidence inventory, facts file reference, and editable canonical settings and approved role families. Use the career API documented in `docs/CAREER-CONTROL.md` if available; inspect its current schema before writes. Save a pending draft when the API cannot represent an answer.

**Approval gates:** Confirm proposed preferences and the ranked role list with the user before saving them as families. This session does not authorize applications or approve a resume template.

**Completion checks:** Compensation distinguishes base, total cash and contract rate; locations and exclusions are explicit; every ranked role cites facts-file entries; gaps remain visible; the user approved the list; unresolved required questions keep the session open.
