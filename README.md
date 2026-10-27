# Career Atlas

Track applications, supporting documents and employer outcomes on your computer. Explore applications by city, role family or company. An AI agent is required for setup and search workflows; the app is your visual workspace. Direct the agent in chat and use the app's queue controls to review, hold or skip roles. Both operate on the same local records. Any local assistant (Codex, Claude Code, or another agent that can run commands) can use the API and the workflows in `skills/` with you.

## Install

Give this link to your assistant and ask it to install Career Atlas, or run one line yourself on macOS or Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/grahamnotgrant/career-atlas/main/scripts/install.sh | sh
```

The script downloads the official Node.js 24 build into a private folder (checksum verified, no package manager) when no suitable Node exists, clones into `~/career-atlas`, initializes private storage, builds and starts the app at `http://127.0.0.1:4317`, and installs assistant shortcuts for any agent it detects. Rerunning it updates the checkout. Windows: install Node.js 24 and Git, then use the manual steps below.

**If you are an AI assistant reading this:** run the install script above (or the manual steps), then open the checkout and follow `AGENTS.md`, starting with `docs/AGENT-START.md`. Do not ask the person for their resume or history until `docs/PRIVACY.md` has been explained. Never create a second data directory to resume an existing search.

Manual steps need Node.js 24 or later, npm and Git. macOS with Node 24–26 is tested; Windows and Linux runtime testing remains outstanding.

```sh
git clone https://github.com/grahamnotgrant/career-atlas.git
cd career-atlas
npm ci
npm run atlas -- setup --commands=auto
npm run atlas -- start
```

Open [Career Atlas](http://127.0.0.1:4317). Setup starts with empty records. Ask your assistant to read [AGENTS.md](AGENTS.md) and follow [onboarding](docs/ONBOARDING.md). Claude reads the same instructions through [CLAUDE.md](CLAUDE.md).

To change the data folder, set `CAREER_FLOW_DATA` to an absolute private directory before setup. Keep the same setting for later commands. Set `PORT` when 4317 is occupied. The app never kills a process to free a port.

```sh
npm run atlas -- doctor
npm run atlas -- stop
```

## Records and approvals

For a new agent, start with [Start, resume or change the search](docs/AGENT-START.md). It covers onboarding, daily work, checking source updates, verifying spreadsheet exports and handling changes without relying on chat history. Give agents outside this checkout its path and ask them to read `AGENTS.md`. [Workflow contracts](docs/WORKFLOW-CONTRACTS.md) define permissions, evidence and material preservation for every path.

The app keeps discovered, prepared, attempted, blocked, uncertain and confirmed records separate. Confirmed submissions require a receipt or employer acknowledgment. A record of a reviewed job is not a submitted application. Original employer titles and source evidence remain available.

Bundled [skills](skills/) cover direction, resume critique, evidence gathering, role templates, role scouting, search execution, record maintenance, daily coordination and outcome review. Scouting reads public employer job boards (Ashby, Greenhouse, Lever, Workable, SmartRecruiters and Workday) with `npm run scout`, and grows its own board list from the Hacker News hiring thread and any company list; no connector or account is required. Skills save progress for interrupted conversations and include mandatory [writing rules](skills/stop-slop/SKILL.md). Users approve template changes and individual or bounded batches of applications. Authorized, clear source-backed maintenance proceeds after agent review and readback. Ambiguous matches and new claims still need the user's input. Exclusive claims and revision checks coordinate agents. One agent can run the same workflow in sequence.

Ask your assistant to follow [daily flow](skills/daily-flow/SKILL.md) to reconcile updates, gather new evidence, scout and submit eligible roles within existing valid grants, then verify the records and export. A blocker on one role does not stop independent work. Daily flow runs when invoked; it does not create a schedule or expand application permissions.

The default Work screen shows the next question, agent check-ins, pending instructions, source coverage and application authority. Answer in the app or direct the agent in chat; both use the [workspace protocol](docs/WORKSPACE-CONTROL.md). Instructions stay pending until an external agent acknowledges them. Review exact proposed wording and approved templates, pause or revoke a grant, and change preferences in the workspace. Agent check-ins, app connection and source/export health remain separate.

Sixty-four cities have scenes; an assistant adds any other city with one command and it appears on the globe with a generic scene. The visual shows city cohorts, recorded interview stages and outcome totals. Select a stage or outcome to see where those applications are: ribbons run from the orb to each city and to the Remote satellite, and a panel lists the companies by location, what happened next, how long each has waited and past applications. City counts are coloured by response rate, applications silent for 30 days move to a No reply orb that only you can close, the footer shows twelve weeks of applications sent against responses received, and a digest reports what landed since your last visit. `npm run resumes` proposes links to saved resume PDFs; [resume linking](docs/RESUME-LINKING.md) defines which evidence is sufficient. The Queue tab lists roles an agent has found and sorted, strong fits first; agents apply to eligible roles under your grant unless you put one on hold. The records workspace includes target roles, company history and outcome comparisons. Preferences and application permissions are managed through the Work screen, your assistant and the local career API. These features depend on imported evidence. Partial imports cannot support whole-search conversion rates.

The [approved workspace roadmap](docs/WORKSPACE-ROADMAP.md) covers task-focused compact views, durable agent activity and questions, equivalent app/chat steering, and evidence across professions. Delivery is tracked under [issue #2](https://github.com/grahamnotgrant/career-atlas/issues/2).

## Personal storage

Default data locations retain the original `career-flow` name so existing records stay in place:

- macOS: `~/Library/Application Support/career-flow`
- Linux: `$XDG_DATA_HOME/career-flow`, or `~/.local/share/career-flow`
- Windows: `%LOCALAPPDATA%/career-flow`

SQLite holds canonical application and workspace records. SHA-256-named artifacts preserve evidence files. The sourced facts file defaults to `DATA/evidence/facts.md`; agents resolve existing settings and session pointers before creating it. Detailed source notes and originals stay private; agents publish relevant facts, questions and source checkpoints to the Work screen. Session notes, resumes, receipts, exports and backups belong outside this checkout. The [privacy guide](docs/PRIVACY.md) explains what an external AI provider or employer receives.

Core operation uses local assets and a loopback server. Dependency installation requires network access. No model service, cloud database, telemetry or remote fonts are configured. Opening an employer source link uses that external service.

## Excel, backup and updates

The running app projects changed records into timestamped Excel workbooks and full JSON companions. Check `exports/workbook-status.json` or `doctor` for the latest exported revisions. Workbook edits do not modify canonical records.

```sh
npm run operations -- excel
npm run operations -- json /absolute/new-export.json
npm run operations -- backup /absolute/new-backup-directory
npm run operations -- restore /absolute/new-data-directory /absolute/backup-directory
```

Restore verifies hashes and SQLite integrity in a new directory; it does not overwrite current files. Read [operations](docs/OPERATIONS.md) before restoring or updating. Updates require a clean checkout and a trusted fetched Git reference, back up personal data, and run build and unit/integration checks.

## Assistant control

```sh
npm run career -- state
npm run control -- state
npm run control -- filter '{"status":"rejected"}'
npm run control -- reset '{}'
```

Use the same data directory as the server and set `CAREER_FLOW_URL` for a different port. The CLI reads the local control token without printing it. See [the view control contract](docs/CONTROL.md) and [career record commands](docs/CAREER-CONTROL.md) for claim, approval and reconciliation actions.

## Importing existing records

Use `npm run import -- /absolute/path/manifest.json` for a manifest validated by `shared/model.ts`. Reconcile source IDs, receipt evidence and duplicate job listings before describing an import as complete. The historical reconciliation script supports the documented source formats; arbitrary spreadsheets and mail providers need an explicit adapter or agent review.

The optional private `source-watch.json` file accepts `ledgerPath`, `year` and `intervalMs`. Its first scan records a baseline; later confirmed additions update the scene. It does not replace historical reconciliation. The watcher never edits the source ledger.

For fictional examples, run `npm run demo` with a separate empty data directory, then start the app with that same directory. Demo and private imports cannot share a database.

For a Work-screen example spanning design portfolios, coursework/volunteering and operations experience, use `npm run demo:workspace` with a separate empty data directory. It includes a question, pending instruction, partial source and incomplete historical material inventory. These are synthetic examples, not real submissions or agent activity. The command refuses an existing workspace. Open `/?view=journey` to go directly to the visual overview.

## Verify

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Tests use fictional fixtures in temporary directories. Browser checks run on an isolated port. Keep private screenshots and real acceptance evidence outside the repository. See [the product specification](docs/plans/career-atlas-product-spec.md) and [implementation issue #1](https://github.com/grahamnotgrant/career-atlas/issues/1) for scope and remaining release validation.

## License

Original project code and bundled writing instructions use the [MIT License](LICENSE). See [third-party notices](docs/THIRD-PARTY-NOTICES.md) for geographic data and other dependencies. A local or private installation does not publish your personal data or make this repository public.

### Optional agent shortcuts

Run `npm run atlas -- setup --commands=auto` to install project shortcuts during setup. Start with `$career-start` in Codex or `/career-start` in Claude Code. [Installation, updates and uninstall](docs/AGENT-COMMANDS.md).
