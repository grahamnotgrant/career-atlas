# Historical reconciliation

The reconciliation script writes private review artifacts. It never imports into the running database.

```sh
CAREER_ATLAS_YEAR=2026 CAREER_ATLAS_RECIPIENT_NAME='Your greeting name' \
  npx tsx scripts/reconcile-history.ts /private/APPLICATIONS.md /private/jobs.xlsx \
  /private/review-output /private/current-manifest.json /private/evidence
```

`CAREER_ATLAS_YEAR` defaults to the current calendar year. Set it explicitly when reconciling a fixed cohort. Ledger rows and email evidence must match this year. Supply a workbook and preserved manifest scoped to the same cohort; those sources may contain undated records and are not silently discarded.

`CAREER_ATLAS_RECIPIENT_NAME` identifies the recipient in an email greeting, such as `Alex` or `Alex Chen`. Standalone confirmation extraction is skipped when the name is unknown. The parser requires that exact name, a role, a company and affirmative acknowledgment. Existing ledger-to-email matching still requires the recorded role and employer. Incomplete applications and reminders do not become submitted applications.

Keep output and email evidence outside the repository. Review proposed role matches before import. Use a fresh canonical export as the preserved manifest to retain later outcomes and reviewed interview stages. Stage repairs can be applied using `scripts/reconcile-stages.ts`; its output contains only explicitly reviewed applications.

## Import trust rules

Historical discovery stays separate from submission. The importer requires explicit confirmation language or an employer acknowledgment and preserves its provenance. Decline matching rejects vague scheduling and ongoing-review messages. Same-title jobs require matching source URL evidence before deduplication. Unknown submission dates and interview stages remain unknown.

A ledger transcript is a recorded observation, not a newly fetched primary employer receipt. Import reports must retain that distinction, unresolved claims and source coverage.

## Input formats

The importer reads two private inputs. Neither ships with the software.

- A tracking workbook (`.xlsx`). `shared/history.ts` reads it by the column headers in `WORKBOOK_COLUMNS`: `Company`, `Title`, `Apply Link`, `Location`, `Work Mode`, the free-text notes columns `History (APPLICATIONS.md)` and `Flags`, and the description columns `Source`, `Why Good Fit` and `Underqualifications`. A workbook with other headers can pass its own mapping to `workbookOpportunities`.
- A ledger in Markdown with a `## Submitted` section. Each row is a pipe-separated line with at least seven cells beginning with the date (`YYYY-MM` or `YYYY-MM-DD`), then title, company, a spare cell, location, source and a confirmation note. Receipts live beside it as `receipts/*confirmation*.txt`; `server/source-watcher.ts` watches both.
