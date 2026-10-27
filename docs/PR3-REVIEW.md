# PR #3 review dispositions

Reviewed against base `b0baa61d804becea1105960fd0e1e6bff8fae657`, starting at head `12fc1bb2c9d75e4365d1df016fbbe4fb267a67ef`. The user authorized independent subagent review, fixes and merge after validation, with UI/UX Pro Max and Make Interfaces Feel Better applied.

## Standards

The backend reviewer found one confirmed defect: a successful export in a never-imported workspace omitted generation metadata and remained permanently pending. Export revisions now normalize the initial generation to zero. The regression failed before the fix and passed afterward. The reviewer found no remaining backend/schema/auth/transaction/idempotency/migration/artifact-integrity blockers in the reviewed scope.

## Spec

The workflow reviewer found one confirmed defect: CLI wording approval silently used a fresh revision even when contribution/support changed after the person reviewed the wording. `approve-fact` now requires the captured reviewed revision; stale support with identical wording conflicts. Invalid/duplicate flags and retry revision overrides are rejected. A fictional-store regression reproduced the old behavior and passed after the fix. No remaining concrete spec blockers were found in the review scope.

## UI and interaction

| Before                                                                          | After                                                                                                      |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Narrow globe retained a left-aligned or stale horizontal scroll position        | Centers on initial layout and viewport-width changes; ordinary updates preserve manual panning             |
| Cream decision surface and pale form inputs stood apart from the dark workspace | Muted navy card/input surfaces, readable light text, blue links/focus/primary action                       |
| Empty state carried the same visual emphasis as a question                      | Quieter surface, smaller heading/padding and secondary queue action                                        |
| Saving an answer could erase newer text                                         | Submitted-draft identity preserves later edits                                                             |
| Saving or retrying an instruction could erase newer text                        | Edit-generation checks preserve later instruction drafts                                                   |
| Saving preferences could reset newer edits                                      | Later edits remain dirty against the successful save revision                                              |
| Selecting another question dropped keyboard focus                               | Focus moves to its heading and Tab reaches the answer                                                      |
| Advancing after an answer could leave focus on the page body                    | Recover focus to the next question when needed; incoming questions do not interrupt unrelated typing       |
| Pending instruction delivery blocked application authority controls             | Independent busy states and priority grant-state delivery keep pause/revoke available with revision checks |
| Browser coverage missed delayed-edit races and enlarged fixed-pixel text        | Held-request/retry cases and 200% rendered CSS zoom are exercised with synthetic records                   |

## Verification

- 195 unit/integration tests across 30 files, production build and changed-file formatting/whitespace passed.
- Complete 38-case Chromium suite passed, including the globe, palette, delayed saves, keyboard, authority, 200% rendered CSS zoom, original journey and scale checks.
- The affected Work suite was rerun after the final focus correction.
- Independent review approved resize centering and the grant-state priority path; the existing server still enforces expected career revisions, authorization and transaction checks.

No reviewer-bot comments or repository-required remote checks were present when initially inspected. Recheck live PR state and the exact head immediately before merge. Tests use fictional data; private source files and live screenshots are not included here. Existing preview/provider/platform limits remain in WORKSPACE-ACCEPTANCE.md.
