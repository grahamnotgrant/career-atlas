---
name: build-role-templates
description: Produce and obtain approval for factual resume templates tailored to approved role families.
---

# Build role templates

Read `../SESSION.md` and `../stop-slop/SKILL.md`.

**Inputs:** the user's current resume (the starting document), the approved ranked families, the facts file from `../uncover-evidence/SKILL.md`, the resume critique and approved claims.

1. Choose an approved family with sufficient facts. Map its common duties to facts-file entries.
2. Start from the current resume, not a blank page. Keep the original titles, employers and dates. Reorder and rewrite so the family's duties lead, using only facts-file entries; add nothing the facts file does not support. Keep a claim-to-fact map outside the resume.
3. Build a restrained single-column document with standard headings, consistent dates and text-based contact details.
4. Run the `stop-slop` pass in full: every factual sentence checked against its fact entry, stock phrases removed, read aloud.
5. Generate the document with available local tools. Extract text, inspect reading order, render pages and check clipping, page breaks and links.
6. Present the exact version for approval and record its hash, family and approval date. Save a new immutable version for later changes; a changed claim or positioning invalidates approval for that version until the user reviews it.

Per-role tailoring happens later in `../run-search/SKILL.md` from an approved template: the agent adjusts emphasis and wording for one posting, runs `stop-slop` again, and preserves the exact file and hash. Those copies do not need separate approval, because they may not add claims beyond the approved template and facts file; the user can open any of them from the record.

**Outputs:** private template files, extractable text, verification notes, claim-to-fact map and canonical template approval record.

**Approval gates:** User approval of the exact template/version is required before use in applications. Template approval alone does not authorize submitting applications.

**Completion checks:** Approved artifact exists and matches its hash; every claim maps to a facts-file entry; stop-slop pass recorded; visual/extraction checks pass; unapproved versions cannot be mistaken for approved ones.
