---
name: scout-roles
description: Find new roles from employer job boards, store them as opportunities and triage them for the applier.
---

# Scout roles

Read `../SESSION.md`, `../stop-slop/SKILL.md` and repository `AGENTS.md`. Complete Common startup in `../../docs/AGENT-START.md` first. This skill finds and sorts roles; it does not claim, prepare or submit. Hand triaged roles to `../run-search/SKILL.md` steps 3–7.

The core method needs no connector, account or key. Ashby, Greenhouse and Lever publish each company's openings as public JSON, and `npm run scout` reads them directly. Any agent with Node and the local career API can run every required step below. Optional sources only add companies to the board list.

**Inputs:** current settings (families, locations, compensation floors, exclusions), the board list at `DATA/scout/boards.json`, the last scout checkpoint, and stored opportunities.

1. Read fresh settings and the previous `scout-roles` session. Note the checkpoint in `DATA/scout/checkpoint.json`; the next poll starts there. On a first run, `npm run scout -- seed` builds the board list from every stored opportunity URL plus the bundled `starter-boards.json`; that list is a neutral starting point, not the user's history.
2. Run `npm run scout -- poll`. It fetches every board, keeps titles matching the role families, locations the user accepts, postings published since the checkpoint, and URLs not already stored. It writes `DATA/scout/candidates-<time>.json` and advances the checkpoint only when every board answered. Use `--days N` to widen the window, `--all-titles` or `--any-location` to inspect what the filters removed. Failed boards are listed; a 404 usually means the company moved or closed its board, so remove it from the list after checking the company's careers page.
3. Review the candidates file. Pay stated by the employer is captured; missing pay stays unknown, not assumed. Discard clearly out-of-scope titles the patterns let through; keep everything else.
4. Store the kept candidates with `npm run scout -- store <candidates.json>`. Each becomes a `discovered` opportunity with the employer URL, full description, location, pay and publish date as employer provenance. The command posts through the career API and refuses URLs already stored.
5. Triage each stored role with the `triage` action in `../../docs/CAREER-CONTROL.md`: read the full description, compare pay against the floor for its location, check duties against the families and exclusions, and check company history for earlier applications, rejections and any recorded application limit (a company at its cap is `standard` at best, with the reopening date in the reason). `top` for a strong fit or high pay, `standard` otherwise, `skip` when it fails the grant, with the reason. Never clear a user hold or decision.
6. Grow the board list every run. `npm run scout -- discover --hn 1` probes every company in the latest Hacker News hiring thread; `--names <file>` probes any list of company names (a Fortune 1000 list, a VC portfolio page, conference sponsors, companies named in the user's inbox). `npm run scout -- probe "<Company>"` or a careers URL handles single finds from any source: web search, a connector, a browser, a newsletter. Workday careers pages (`<tenant>.wdN.myworkdayjobs.com/<site>`) are how most large enterprises publish; find the URL by any means and `probe` it. Everything that answers with postings is added; the next poll covers it automatically. Aggregator listings (Indeed, Dice, LinkedIn, ZipRecruiter) are leads to a board, not records: do not store an aggregator link as the opportunity URL when the employer page exists.
7. Save the session: polled boards, checkpoint, candidates file, stored opportunity IDs, triage counts by tier, boards added or removed, and sources that were unavailable. Finish with the startup guide's API read-back; scouting does not change the workbook's application sheets, so export verification is only needed if other records changed.

**Outputs:** candidates file, stored opportunity IDs with provenance, triage decisions, updated board list and checkpoint, session record.

**Approval gates:** scouting stores and sorts roles; it needs no application authorization and grants none. Submission remains governed by the active grant and `run-search`.

**Completion checks:** every stored role has an employer URL, publish date and full description; no stored role duplicates an existing URL; pay comparisons use the floor for the role's location; the checkpoint was advanced only past boards that answered; the session names the candidates file and the boards that failed.
