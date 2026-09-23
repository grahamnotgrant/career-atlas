import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../server/paths";
import {
  boardFromUrl,
  boardListSchema,
  boardRequests,
  canonicalJobUrl,
  hiringThreadCompanies,
  slugGuesses,
  checkpointSchema,
  defaultTitlePatterns,
  filterPostings,
  parseBoard,
  toOpportunity,
  type Board,
  type Posting,
} from "../shared/scout";

const usage = `Usage:
  npm run scout -- seed                      Add every ATS board found in stored opportunity URLs
  npm run scout -- add <ashby|greenhouse|lever|workable|smartrecruiters> <slug> [company]
  npm run scout -- add workday <tenant> <company> --host wd5 --site <site>
  npm run scout -- probe <company name or careers URL> ...   Try every board type; add what answers
  npm run scout -- discover [--hn N] [--names /absolute/names.txt]   Probe companies from the last N Hacker News hiring threads and/or a names file
  npm run scout -- poll [--days N] [--all-titles] [--any-location]
  npm run scout -- store /absolute/candidates.json [--limit N]

Boards live in DATA/scout/boards.json; each poll writes DATA/scout/candidates-<time>.json
and DATA/scout/checkpoint.json. store posts candidates as discovered opportunities through
the local career API; it never submits anything.`;

const dir = dataDirectory(),
  scoutDir = join(dir, "scout"),
  boardsPath = join(scoutDir, "boards.json"),
  checkpointPath = join(scoutDir, "checkpoint.json"),
  url = process.env.CAREER_FLOW_URL ?? "http://127.0.0.1:4317";
mkdirSync(scoutDir, { recursive: true, mode: 0o700 });

function writeAtomic(path: string, value: unknown) {
  const tmp = `${path}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
}
function readBoards(): Board[] {
  if (!existsSync(boardsPath)) return [];
  return boardListSchema.parse(JSON.parse(readFileSync(boardsPath, "utf8")))
    .boards;
}
function saveBoards(boards: Board[]) {
  const seen = new Set<string>();
  const unique = boards.filter((b) => {
    const k = `${b.ats}:${b.slug.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  unique.sort((a, b) =>
    `${a.ats}:${a.slug}`.localeCompare(`${b.ats}:${b.slug}`),
  );
  writeAtomic(boardsPath, { version: 1, boards: unique });
  return unique;
}
function headers() {
  return {
    Authorization: `Bearer ${readFileSync(join(dir, "control-token"), "utf8").trim()}`,
    "Content-Type": "application/json",
  };
}
async function careerState() {
  const r = await fetch(`${url}/api/career`, {
    headers: headers(),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as {
    revision: number;
    settings: { locations: string[] };
    opportunities: { id: string; url: string; company: string }[];
  };
}
async function fetchBoard(b: Board) {
  const rows: Posting[] = [];
  const seen = new Set<string>();
  for (const req of boardRequests(b)) {
    const r = await fetch(req.url, {
      ...req.init,
      headers: {
        "User-Agent": "career-atlas-scout",
        ...(req.init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`${r.status}`);
    for (const row of parseBoard(b, await r.json()))
      if (!seen.has(row.url)) {
        seen.add(row.url);
        rows.push(row);
      }
  }
  return rows;
}
/** Workday search results carry no description and only a relative date;
    one detail call per kept candidate fills both. */
async function workdayDetails(rows: Posting[]) {
  for (const row of rows) {
    if (row.ats !== "workday") continue;
    try {
      const u = new URL(row.url);
      const path = u.pathname.replace(/^\/[^/]+/, "");
      const r = await fetch(
        `https://${u.hostname}/wday/cxs/${row.slug}/${u.pathname.split("/")[1]}${path}`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "career-atlas-scout",
          },
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!r.ok) continue;
      const info =
        ((await r.json()) as { jobPostingInfo?: Record<string, unknown> })
          .jobPostingInfo ?? {};
      if (typeof info.jobDescription === "string")
        row.description = info.jobDescription
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 100000);
      if (typeof info.startDate === "string")
        row.publishedAt = `${info.startDate}T00:00:00.000Z`;
      if (typeof info.location === "string" && info.location)
        row.location = info.location;
    } catch {
      /* Keep the search-result row; the agent reads the page before vetting. */
    }
  }
}
/** Try every board type for a company name; the first that answers with postings wins. */
async function probeCompany(name: string): Promise<Board | null> {
  const tried: string[] = [];
  for (const slug of slugGuesses(name))
    for (const ats of [
      "ashby",
      "greenhouse",
      "lever",
      "workable",
      "smartrecruiters",
    ] as const) {
      const board: Board = {
        ats,
        slug,
        company: name,
        addedAt: new Date().toISOString(),
        source: "probe",
      };
      tried.push(`${ats}:${slug}`);
      try {
        const rows = await fetchBoard(board);
        if (rows.length) return board;
      } catch {
        /* not this one */
      }
    }
  return null;
}
const flag = (name: string) => process.argv.includes(name);
const option = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const [action] = process.argv.slice(2);
if (action === "seed") {
  const state = await careerState();
  const found: Board[] = [];
  for (const o of state.opportunities) {
    const b = boardFromUrl(o.url ?? "");
    if (b)
      found.push({
        ...b,
        company: o.company,
        addedAt: new Date().toISOString(),
      });
  }
  // A fresh installation has no stored URLs yet; the bundled starter list gives the first poll something to read.
  const starter = boardListSchema.parse(
    JSON.parse(
      readFileSync(
        join(
          dirname(fileURLToPath(import.meta.url)),
          "../skills/scout-roles/starter-boards.json",
        ),
        "utf8",
      ),
    ),
  ).boards;
  const before = readBoards();
  const after = saveBoards([...before, ...found, ...starter]);
  console.log(
    JSON.stringify({
      before: before.length,
      after: after.length,
      path: boardsPath,
    }),
  );
} else if (action === "add") {
  const [, ats, slug, company = ""] = process.argv
    .slice(2)
    .filter(
      (a, i, all) =>
        !a.startsWith("--") && !(i > 0 && all[i - 1].startsWith("--")),
    );
  const board = boardListSchema.shape.boards.element.parse({
    ats,
    slug,
    company: company.startsWith("--") ? "" : company,
    addedAt: new Date().toISOString(),
    source: "agent",
    ...(ats === "workday"
      ? { host: option("--host"), site: option("--site") }
      : {}),
  });
  await fetchBoard(board);
  const after = saveBoards([...readBoards(), board]);
  console.log(
    JSON.stringify({ boards: after.length, added: `${ats}:${slug}` }),
  );
} else if (action === "probe" || action === "discover") {
  const inputs: string[] = [];
  if (action === "probe")
    inputs.push(...process.argv.slice(3).filter((a) => !a.startsWith("--")));
  else {
    const months = Number(option("--hn") ?? 0);
    if (months) {
      const stories = (await (
        await fetch(
          `https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=%22who%20is%20hiring%22&hitsPerPage=${months}`,
          { signal: AbortSignal.timeout(20000) },
        )
      ).json()) as { hits: { objectID: string; title: string }[] };
      for (const story of stories.hits.filter((h) =>
        /who is hiring/i.test(h.title),
      )) {
        const item = (await (
          await fetch(`https://hn.algolia.com/api/v1/items/${story.objectID}`, {
            signal: AbortSignal.timeout(30000),
          })
        ).json()) as { children: { text: string | null }[] };
        inputs.push(
          ...hiringThreadCompanies(item.children.map((c) => c.text ?? "")),
        );
        console.error(`${story.title}: ${item.children.length} comments`);
      }
    }
    const namesFile = option("--names");
    if (namesFile)
      inputs.push(
        ...readFileSync(resolve(namesFile), "utf8")
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#")),
      );
    if (!inputs.length) throw new Error(usage);
  }
  const existing = readBoards();
  const known = new Set(
    existing.map((b) => `${b.ats}:${b.slug.toLowerCase()}`),
  );
  const knownCompanies = new Set(existing.map((b) => b.company.toLowerCase()));
  const added: Board[] = [];
  const missed: string[] = [];
  let i = 0;
  const unique = [...new Set(inputs)];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (i < unique.length) {
        const input = unique[i++];
        let board: Board | null = null;
        if (/^https?:\/\//.test(input)) {
          board = boardFromUrl(input);
          if (board && !board.company)
            board.company = board.slug
              .replace(/[-_]+/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase());
          if (board) {
            try {
              await fetchBoard(board);
            } catch {
              board = null;
            }
          }
        } else if (!knownCompanies.has(input.toLowerCase()))
          board = await probeCompany(input);
        else continue;
        if (board && !known.has(`${board.ats}:${board.slug.toLowerCase()}`)) {
          known.add(`${board.ats}:${board.slug.toLowerCase()}`);
          added.push({
            ...board,
            addedAt: new Date().toISOString(),
            source: action === "probe" ? "probe" : "discover",
          });
        } else if (!board) missed.push(input);
      }
    }),
  );
  const after = saveBoards([...existing, ...added]);
  console.log(
    JSON.stringify(
      {
        inputs: unique.length,
        added: added.map((b) => `${b.ats}:${b.slug} (${b.company})`),
        missed: missed.length,
        boards: after.length,
      },
      null,
      2,
    ),
  );
  if (missed.length)
    console.error(
      `No public board found for: ${missed.slice(0, 40).join("; ")}${missed.length > 40 ? "; …" : ""}`,
    );
} else if (action === "poll") {
  const boards = readBoards();
  if (!boards.length) throw new Error("No boards. Run seed or add first.");
  const state = await careerState();
  const days = Number(option("--days") ?? 0);
  const previous = existsSync(checkpointPath)
    ? checkpointSchema.parse(JSON.parse(readFileSync(checkpointPath, "utf8")))
    : null;
  const since = days
    ? new Date(Date.now() - days * 86400000).toISOString()
    : (previous?.since ?? new Date(Date.now() - 7 * 86400000).toISOString());
  const polledAt = new Date().toISOString();
  const knownUrls = new Set(
    state.opportunities.filter((o) => o.url).map((o) => canonicalJobUrl(o.url)),
  );
  const failed: string[] = [];
  const all: Posting[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: 12 }, async () => {
      while (i < boards.length) {
        const b = boards[i++];
        try {
          all.push(...(await fetchBoard(b)));
        } catch (e) {
          failed.push(
            `${b.ats}:${b.slug} ${e instanceof Error ? e.message : e}`,
          );
        }
      }
    }),
  );
  const candidates = filterPostings(all, {
    titlePatterns: flag("--all-titles") ? [] : defaultTitlePatterns,
    locations: flag("--any-location") ? [] : state.settings.locations,
    since,
    knownUrls,
  });
  await workdayDetails(candidates);
  candidates.sort((a, b) =>
    (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
  );
  const out = join(
    scoutDir,
    `candidates-${polledAt.replace(/[:.]/g, "-")}.json`,
  );
  writeAtomic(out, {
    version: 1,
    polledAt,
    since,
    filters: {
      titles: !flag("--all-titles"),
      locations: flag("--any-location") ? [] : state.settings.locations,
    },
    careerRevision: state.revision,
    candidates,
  });
  // Advance the checkpoint only past boards that answered; failed boards are retried from the same instant.
  writeAtomic(checkpointPath, {
    version: 1,
    polledAt,
    since: failed.length ? since : polledAt,
    boards: boards.length,
    failed,
  });
  console.log(
    JSON.stringify(
      {
        boards: boards.length,
        failed: failed.length,
        postings: all.length,
        since,
        candidates: candidates.length,
        withPay: candidates.filter((c) => c.compensation.min !== null).length,
        path: out,
      },
      null,
      2,
    ),
  );
  for (const c of candidates.slice(0, 40))
    console.log(
      `${(c.publishedAt ?? "").slice(0, 10)} ${c.company.slice(0, 22).padEnd(22)} ${c.title.slice(0, 50).padEnd(50)} | ${c.location.slice(0, 28).padEnd(28)} | ${c.compensationSummary}`,
    );
  if (failed.length) console.error(`Failed boards: ${failed.join("; ")}`);
} else if (action === "store") {
  const path = process.argv[3];
  if (!path) throw new Error(usage);
  const file = JSON.parse(readFileSync(resolve(path), "utf8")) as {
    candidates: Posting[];
  };
  const limit = Number(option("--limit") ?? file.candidates.length);
  const state = await careerState();
  const knownUrls = new Set(
    state.opportunities.filter((o) => o.url).map((o) => canonicalJobUrl(o.url)),
  );
  const recordedAt = new Date().toISOString();
  const opportunities = file.candidates
    .filter((c) => !knownUrls.has(canonicalJobUrl(c.url)))
    .slice(0, limit)
    .map((c) => toOpportunity(c, recordedAt));
  if (!opportunities.length) {
    console.log(
      JSON.stringify({ stored: 0, reason: "all candidates already stored" }),
    );
  } else {
    const id = randomUUID();
    const request = {
      id,
      expectedRevision: state.revision,
      action: "opportunities",
      payload: { opportunities },
    };
    mkdirSync(join(dir, "requests"), { recursive: true, mode: 0o700 });
    const saved = join(dir, "requests", `${id}.json`);
    writeFileSync(saved, JSON.stringify(request, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    console.error(`Saved request: ${saved}`);
    const r = await fetch(`${url}/api/career/commands`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30000),
    });
    const text = await r.text();
    if (!r.ok) {
      console.log(text);
      process.exitCode = 1;
    } else
      console.log(
        JSON.stringify({
          stored: opportunities.length,
          ids: opportunities.map((o) => o.id),
          revision: (JSON.parse(text) as { revision: number }).revision,
        }),
      );
  }
} else throw new Error(usage);
