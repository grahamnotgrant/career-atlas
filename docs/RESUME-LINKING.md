# Linking saved resumes

An application shows "Resume used to apply" only when a PDF is linked to it. Imports link a resume when the record states the file and its hash. For everything else, `npm run resumes` proposes links from PDFs on your disk and attaches the ones you accept. Nothing links without a review step, and every link says how it was found.

## Propose

```sh
npm run resumes -- propose ~/resumes ~/applications/output --out ~/private/resume-plan.json
```

The command hashes every PDF under the folders you name, then looks at each application that has no linked resume, in this order:

1. **Hash.** The record's own text states a SHA-256, or a prefix of one, that matches a file. Tier `hash`.
2. **Filename.** The record names a PDF that exists once. Tier `named`. If the same name exists with different contents, the entry is marked `review: "choose"` and lists the options.
3. **Company name.** Exactly one file carries the company's name and nothing in the record names it. Tier `company`, marked `review: "confirm"`.

Applications matching nothing are left out; the popup shows "No resume file found for this application."

## Review

Open the plan. Every entry has `file`, `sha256`, `tier` and `basis`. Delete entries you do not want. For entries with `review`, set `file` from `options` and remove the `review` key to accept them, or delete them; `apply` skips anything still marked for review. You can add entries by hand for cases the matcher cannot see, such as a base resume variant your own notes record. Use tier `variant` for those, and say in `basis` where the knowledge comes from.

## Apply

```sh
npm run resumes -- apply ~/private/resume-plan.json
```

Each entry with a file is copied into the private `artifacts` directory by hash and attached as `resume` evidence with the tier's label:

| Tier      | Label shown in the popup                                 |
| --------- | -------------------------------------------------------- |
| `hash`    | Resume recorded in receipt, hash verified                |
| `named`   | Resume named in the record; bytes not verified           |
| `variant` | Resume variant named in the record; file supplied by you |
| `company` | Resume matched by company name; confirmed by you         |

An application that already has a resume file is skipped unless you pass `--replace`. Keep plans and resumes outside this repository.
