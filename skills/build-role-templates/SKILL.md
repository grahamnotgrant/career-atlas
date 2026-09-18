---
name: build-role-templates
description: Produce and obtain approval for factual resume templates tailored to role families.
---

# Build role templates

Read `../SESSION.md` and `../stop-slop/SKILL.md`.

**Inputs:** ranked families, evidence inventory, resume critique and approved claims.

1. Choose a family with sufficient evidence. Map its common duties to supported accomplishments.
2. Build a restrained single-column resume with standard headings, consistent dates and text-based contact details. Keep the original title and employer history accurate.
3. Emphasize relevant work without inventing qualifications. Keep a claim-to-source map outside the resume.
4. Generate the document using available local tools. Extract text, inspect reading order, render pages and check clipping, page breaks and links.
5. Apply the writing rules. Present the exact version for approval and record its hash, family and approval date.
6. Save a new immutable version for later changes. A changed claim or positioning invalidates approval for that version until the user reviews it.

**Outputs:** private template files, extractable text, verification notes, source map and canonical template approval record.

**Approval gates:** User approval of the exact template/version is required before use in applications. Template approval alone does not authorize submitting applications.

**Completion checks:** Approved artifact exists and matches its hash; source map covers factual claims; visual/extraction checks pass; unapproved versions cannot be mistaken for approved ones.
