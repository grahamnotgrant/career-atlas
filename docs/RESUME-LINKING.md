# Linking saved resumes

An application shows "Resume used to apply" when a PDF is linked to it. That label does not establish what was uploaded. `npm run resumes` proposes links from saved PDFs; review the application identity and source evidence before applying a plan. `WORKFLOW-CONTRACTS.md` defines the permission and evidence rules.

## Propose

```sh
npm run resumes -- propose ~/resumes ~/applications/output --out ~/private/resume-plan.json
```

The command hashes PDFs under the folders you name (up to four nested directory levels), then looks at each application that has no linked resume, in this order:

1. **Hash.** The record's own text states a SHA-256, or a prefix of one, that matches a file. Tier `hash`.
2. **Filename.** The record names a PDF that exists once. Tier `named`. If the same name exists with different contents, the entry is marked `review: "choose"` and lists the options.
3. **Company name.** Exactly one file carries the company's name and nothing in the record names it. Tier `company`, marked `review: "confirm"`.

Applications matching nothing are left out; the popup shows "No resume file found for this application." The proposer does not inspect DOCX files or prove that a hash in an application's combined evidence refers to its submitted resume.

## Review

Open the plan. Every entry has `file`, `sha256`, `tier` and `basis`. The tool's `review` flag is incomplete: even an unflagged `hash` or `named` proposal still needs policy review.

Under an authorized maintenance request, the agent can review and apply a link without asking again only when all of these are established:

- The source identifies the exact application, including its posting or receipt identity.
- That source specifically identifies the submitted resume by its full 64-character SHA-256, and exactly one distinct file matches it.
- The chronology supports use of that file at submission, with no conflicting evidence or replacement of an existing link.

Ask one focused question when only a filename, hash prefix, company name or resume variant is known, or when identity, chronology or sources conflict. Preserve the gap while continuing independent work. Do not treat the existence of a later file as proof of an earlier upload.

Delete unresolved entries from the apply plan or retain a `review` flag so `apply` skips them. After the user resolves a flagged entry, set `file` from `options` and remove `review`, or delete it. A manually added variant uses tier `variant` and a `basis` citing the user's decision and source; preserve the uncertainty about original uploaded bytes. Record the reviewed plan, source-specific full-hash checks and any user decision privately.

## Apply

```sh
npm run resumes -- apply ~/private/resume-plan.json
```

Recompute each accepted file's full hash and compare it with the reviewed plan and source immediately before applying. The command validates and hashes the current PDF bytes, but does not compare them with the plan's `sha256` field or enforce the review rules above. Each accepted entry with a file is copied into private `artifacts` by hash and attached as `resume` evidence with the tier's label:

| Tier      | Label shown in the popup                                 |
| --------- | -------------------------------------------------------- |
| `hash`    | Resume recorded in receipt, hash verified                |
| `named`   | Resume named in the record; bytes not verified           |
| `variant` | Resume variant named in the record; file supplied by you |
| `company` | Resume matched by company name; confirmed by you         |

The tier labels describe the match method. A `hash` label can originate from a prefix match; it is not sufficient evidence by itself. An application that already has a resume file is skipped unless you pass `--replace`. Replacing a link requires resolving the conflict with the user first; preserve the previous evidence and reviewed reason privately before replacement.

Read back the application and its linked evidence/hash after applying, then verify the spreadsheet export separately. A confirmed submission remains confirmed if its historical resume is missing or unresolved. Keep plans, originals, sources and decisions outside this repository. Preserve DOCX originals and hashes privately; do not present a derived PDF or manually captured text as the original uploaded file.
