# Install and onboard

## Install

On macOS or Linux, `scripts/install.sh` (the one-line command in `README.md`) installs Node.js 24 when needed, clones, sets up, starts the app and installs assistant shortcuts. Otherwise use Node.js 24 or later and Git, clone the repository into a software folder, then run:

```sh
npm ci
npm run atlas -- setup
npm run atlas -- start
npm run atlas -- doctor
```

Open `http://127.0.0.1:4317`. Choose another `PORT` when that port belongs to another service. Set `CAREER_FLOW_DATA` to an absolute private folder before setup to override storage. Use the same setting for later commands. For a foreground start, open the resolved current URL and verify the rendered view; follow `CONTROL.md` when working in the background.

Default personal storage:

- macOS: `~/Library/Application Support/career-flow`
- Windows: `%LOCALAPPDATA%/career-flow`
- Linux: `$XDG_DATA_HOME/career-flow` or `~/.local/share/career-flow`

The setup command initializes the database, creates private artifact/session/template/material folders and builds the UI. It does not invent a profile or import demonstration applications. Use `npm run demo` only with a separate data directory.

## First conversation

Give Codex or Claude this repository and ask it to read `AGENTS.md`. Follow `WORKFLOW-CONTRACTS.md` for permissions, evidence and preserved materials. The agent should:

1. Explain the data folder and sharing boundaries in `PRIVACY.md`.
2. Get the current resume, and what the person enjoys, wants and wants to avoid. Inventory application trackers and authorized source/browser/document tools, including relevant repositories, GitHub, Slack, plans and decision artifacts where available. Ask before reading unrelated files or accounts. Start `skills/discover-direction/SKILL.md` and save progress after each question so the next conversation can resume.
3. Follow `skills/uncover-evidence/SKILL.md`: read authorized work artifacts first, then ask one focused ownership or missing-fact question at a time; suggest voice when available. Resolve the existing facts file from `settings.evidence` and prior sessions before using the default `DATA/evidence/facts.md`. Reconcile competing source pointers before creating a new store. Continue evidence gathering during later work. An observed artifact, who did the work, and approved external wording are separate records; bot or account attribution alone does not prove the person wrote code.
4. Recommend 10–20 ranked roles the person should be applying for, from everything discussed, each citing facts. The user edits and approves the list; it becomes the role families.
5. Critique the current resume, then build one template per approved family from it (`skills/build-role-templates/SKILL.md`), with the `stop-slop` pass, and get each exact version approved.
6. Ask for individual or bounded batch application authorization. Agents then scout (`skills/scout-roles/SKILL.md`) and apply (`skills/run-search/SKILL.md`), tailoring each application from the approved template without adding claims. `skills/daily-flow/SKILL.md` coordinates this work under existing valid grants when invoked; it does not create a schedule or grant permission.

The user can use one agent for this workflow. A browser connector is needed for applications the employer accepts through a web form. The app does not bundle access to email accounts or external AI providers.

## Existing history

Import discoveries and confirmed applications separately. Preserve source IDs, descriptions, dates, receipt evidence and original employer titles. A tracker status alone may be a user report; record that provenance. Do not turn 800 reviewed roles into 800 submitted applications.

Reconcile duplicate job listings by employer and job identity, then connect receipts and outcomes. Keep unknown interview stages and missing resumes visible. A confirmed employer receipt can establish a submission while its material archive remains incomplete. Apply the strict historical matching rules in `RESUME-LINKING.md`; never infer an uploaded file from a filename or variant alone. Compare imported totals with source totals before describing the import as complete.

## Resume after an interruption

The next agent reads the saved private session, fresh canonical settings, approvals and tracker. It checks changed revisions and revoked grants, states one next action and continues. Reuse authorized decisions without asking for repeated approval. Keep source checkpoints, unresolved questions and material gaps in the private session; continue independent work around a role-specific blocker. No hidden chat history is required.
