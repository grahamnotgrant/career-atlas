# Career Atlas: complete local career workspace and portable agent workflows

Issue label: ocean
Repository: https://github.com/grahamnotgrant/career-atlas
Implementation issue: https://github.com/grahamnotgrant/career-atlas/issues/1

## Problem and outcome

The current Career Flow app visualizes a partial collection of confirmed applications. Its watcher imports later confirmed submissions, but does not reconcile the historical search or changing outcomes. The application model requires a submission event, so it cannot represent discovered, prepared, attempted or blocked opportunities without inventing a submission.

Implement the attached Career Atlas specification as a local career workspace usable by Codex or Claude from a public repository link, without prior conversation history. Preserve the interactive globe, city cohorts, application journeys and document popups. Keep personal data outside the code checkout. Publication is a separate release action.

Source specification: docs/plans/career-atlas-product-spec.md.

## Existing foundation

- React/TypeScript, SVG and Motion visual; globe/city navigation and local PDF viewer.
- Node/Fastify loopback API, SQLite records, managed artifact hashes and import manifests.
- Local command interface with revision checks and idempotency receipts.
- Read-only submission-ledger watcher, server-sent updates and conservative confirmation matching.
- Synthetic unit, integration and Chromium tests.

## Required work and acceptance

### 1. Canonical records and migration

- Separate opportunities, application attempts, confirmed submissions and recruiting outcomes. Submission dates remain null until confirmed.
- Model company identity, original employer title, role family, work arrangement, location, compensation currency/period/base/cash, job URL and preserved job description.
- Model interview invitations versus completed interviews, unknown stages, rejection, withdrawal, employer closure and structured offers (base, bonus, equity, currency, location, deadline and decision).
- Store append-only provenance for employer evidence, user reports and hypotheses. Corrections retain history; unknown dates remain unknown.
- Version resume templates, approved claims, tailored materials and submitted artifacts. Preserve exact bytes and hashes with each attempt.
- Add schema migrations with consistent backups and recovery. Keep the existing data directory supported when renaming the product.
- Historical import performs read-only source discovery, deterministic matching and deduplication, then produces a reconciliation report before committing. Distinct roles at one company remain distinct.
- Uncertain or missing confirmations stay unconfirmed. Historical interview and outcome evidence reconciles against the correct application.
- Re-running an import creates no duplicate records. Source failures preserve the last valid dataset.
- Display coverage, unresolved records and source freshness alongside totals so a partial import cannot masquerade as the full search.

### 2. Onboarding and editable preferences

- Create a private workspace in a user-selected folder; distinguish new, existing and demo workspaces.
- Persist resumable onboarding covering goals, experience, evidence, constraints, exclusions, pay floors, geography, work arrangements, resume approvals and application boundaries.
- Settings are editable in the app and readable/writeable through validated local agent commands.
- Record actual browser, document, spreadsheet, connector and agent capabilities. Provide single-agent operation when delegation is unavailable.
- Rank up to 20 target role families using cited experience and preferences. Never pad the list with unsupported fits.

### 3. Portable agent skills

- Bundle discovery, resume critique, evidence probing, role templates, search operations and outcome review skills.
- Each includes entry conditions, inputs, local outputs, resumable state, approval boundaries, completion checks and missing-capability behavior.
- Bundle Stop Slop for all writing on the user's behalf. Verify redistribution rights and attribution for reused material; avoid dependencies on the original developer's home-directory skills.
- Codex and Claude entry instructions must work in a clean session, with no account-specific paths, job assumptions or paid-service requirement.
- Resume checks distinguish personal ownership, team contribution, supported metrics and unresolved claims. Confirmation of a claim is distinct from authorization to submit it.

### 4. Authorized application workflow

- Persist approved templates and bounded individual/batch grants with roles, pay, locations, exclusions, validity and revision.
- Pause and revoke grants. Recheck authorization immediately before submission; a stale claim does not preserve revoked permission.
- Implement exclusive application claims using SQLite transactions, lease expiry, owner IDs and fencing tokens so expired workers cannot submit later.
- Track prepared, attempted, blocked, confirmation-unknown and confirmed-submitted states. Uncertain attempts require reconciliation before retry.
- Match duplicates by canonical job identifier and prior attempts; retain repeat applications to distinct jobs at one company.
- Preserve full job description, tailored resume, answers, template version and receipts. Check extractable text and reading order without claiming universal ATS compatibility.
- Handle available CAPTCHA interactions through the authorized browser; preserve progress and request user completion when blocked.
- Sensitive or unsupported answers require user input. External correspondence and submission stay within explicit authorization.

### 5. Excel, backups and updates

- SQLite is authoritative. Generate an Excel workbook as a revision-stamped projection of the same records, not a second database.
- Include opportunities, applications, events, offers, companies, role families, materials and coverage sheets with stable IDs.
- Use atomic replacement; handle locked workbooks and expose projection lag. Escape untrusted spreadsheet formulas. Manual Excel changes must not silently overwrite canonical records.
- Provide export, backup, restore and integrity verification covering database, artifacts, settings and approval history. Validate paths and hashes before restoration.
- Preserve personal files across code updates. Document recovery from failed migrations and backups without leaking control tokens.
- Document what stays local, what the external AI provider receives and what employers receive. No implicit inbox access or telemetry.

### 6. Visual coverage and improvement loop

- Preserve geographic selection, city-specific filtering, horizontal city stages, the single globe-return control and arrival animations.
- Add the top-role view with application, pending, interview, rejection and offer counts; separate unmatched employer titles and unconfirmed activity.
- Clicking a family scopes/highlights the matching journeys and applications. Original titles remain visible.
- Add company history, repeated applications, material versions, offer detail and source links.
- Compare role families and resume versions with cohort dates, denominators and pending applications visible. Show uncertain classifications and small samples without causal claims.
- Connect explicit employer feedback and user-reported gaps to focused rehearsal/evidence sessions. Keep hypotheses labeled.

### 7. Distribution and verification

- Choose a license, audit bundled assets/skills/dependencies and add contribution, security and privacy documentation before public release.
- Provide install, doctor, start, stop, import, export, backup, restore and update commands. Never terminate unrelated processes or require edits to global agent configuration.
- Test new installation, existing-workspace migration, interrupted onboarding, import reruns, duplicate identity, authorization revocation, racing claims, uncertain submissions, source errors, locked Excel, backup corruption and restore.
- Verify keyboard access, reduced motion, city/role/company filtering, document links, arrival behavior and offers with synthetic fixtures.
- Test 2,000 applications and 20,000 events for responsive exploration and bounded visual density; publish measurements and supported OS/runtime limits.
- Complete a clean-session walkthrough using each documented agent entrypoint, plus the single-agent fallback. Do not claim an untested agent or OS is supported.
- Audit the release tree for personal files, screenshots, resumes, source paths and secrets. Public examples must be synthetic.

## Dependency order and three feedback stops

1. **Data foundation and coverage:** schema, migration, historical reconciliation, provenance and coverage UI. Feedback stop: verified totals, unknowns and the retained visual agree with source evidence.
2. **Onboarding and working search:** preferences, skills, templates, authorization, exclusive claims, material preservation and Excel projection. Feedback stop: complete one synthetic search/application workflow and review real resume/template changes before using them.
3. **Analysis and release candidate:** roles, company history, offers, improvement sessions, backup/restore, updates and clean installation. Feedback stop: end-to-end acceptance and publication review.

Foreman should route bounded implementation issues from these sections. Avoid a replacement rewrite of the existing visual. No historical totals or completed phases should be claimed until reconciled and verified. All personal reconciliation outputs stay in private workspace storage.
