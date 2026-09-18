import { createHash } from "node:crypto";
import { companyIdentity, opportunitySchema, type Opportunity } from "./career";
import { type Application } from "./model";
import { applicationScene } from "./locations";
export const digest = (text: string | Uint8Array) =>
  createHash("sha256").update(text).digest("hex");
export const normalize = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "");
// Tracker company cells sometimes append an office or parent-company note.
const companyPhrase = (name: string) =>
  ` ${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
const mentionsCompany = (body: string, name: string) =>
  body.includes(companyPhrase(name)) ||
  (name.includes(" (") && body.includes(companyPhrase(name.split(" (")[0])));
export function jobIdentity(company: string, title: string, url: string) {
  try {
    const u = new URL(url);
    u.hash = "";
    if (!/^https?:$/.test(u.protocol))
      throw new Error("Unsupported source URL");
    u.pathname = u.pathname.replace(
      /\/(?:application|thanks|confirmation)\/?$/i,
      "",
    );
    for (const k of [...u.searchParams.keys()])
      if (/^utm_|^(source|ref|gh_src)$/i.test(k)) u.searchParams.delete(k);
    return `${companyIdentity(company)}|${u.host.toLowerCase()}${u.pathname.replace(/\/$/, "")}?${u.searchParams.toString()}`;
  } catch {
    return `${companyIdentity(company)}|${companyIdentity(title)}`;
  }
}
/** Column headers a tracking workbook is read by. Pass a different mapping for
    a workbook with other headers; see docs/history-reconciliation.md. */
export const WORKBOOK_COLUMNS = {
  company: "Company",
  title: "Title",
  url: "Apply Link",
  location: "Location",
  workMode: "Work Mode",
  /** Free-text columns whose keywords set the lifecycle. */
  notes: ["History (APPLICATIONS.md)", "Flags"],
  /** Columns joined into the opportunity description. */
  description: ["Source", "Why Good Fit", "Underqualifications"],
};
export type WorkbookColumns = typeof WORKBOOK_COLUMNS;
export function workbookOpportunities(
  rows: Record<string, string>[],
  source: string,
  recordedAt: string,
  columns: WorkbookColumns = WORKBOOK_COLUMNS,
): Opportunity[] {
  const byKey = new Map<string, Opportunity>();
  for (const row of rows) {
    const company = row[columns.company]?.trim(),
      title = row[columns.title]?.trim();
    if (!company || !title) continue;
    const rawUrl = row[columns.url] || "";
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : "",
      key = jobIdentity(company, title, url),
      id = `history-${digest(key).slice(0, 24)}`;
    const notes = columns.notes
      .map((name) => row[name])
      .filter(Boolean)
      .join("\n");
    const lifecycle = /blocked|parked|collision|captcha/i.test(notes)
      ? "blocked"
      : /uncertain|unconfirmed/i.test(notes)
        ? "uncertain"
        : /attempted|form filled/i.test(notes)
          ? "attempted"
          : /prepared|resume ready/i.test(notes)
            ? "prepared"
            : "discovered";
    const candidate = opportunitySchema.parse({
      id,
      company,
      companyKey: companyIdentity(company),
      title,
      jobKey: key,
      url,
      description: columns.description
        .map((name) => row[name])
        .filter(Boolean)
        .join("\n"),
      location: row[columns.location] || "",
      workArrangement: /remote/i.test(row[columns.workMode] || "")
        ? "remote"
        : /hybrid/i.test(row[columns.workMode] || "")
          ? "hybrid"
          : /site|office/i.test(row[columns.workMode] || "")
            ? "onsite"
            : "unknown",
      lifecycle,
      provenance: [
        {
          id: `${id}-source`,
          kind: "source",
          text: JSON.stringify(row),
          source,
          recordedAt,
        },
      ],
    });
    const prior = byKey.get(key);
    if (prior) {
      if (
        !prior.provenance.some((p) => p.text === candidate.provenance[0].text)
      )
        prior.provenance.push({
          ...candidate.provenance[0],
          id: `${id}-source-${prior.provenance.length}`,
        });
    } else byKey.set(key, candidate);
  }
  return [...byKey.values()];
}
export interface HistoryRow {
  key: string;
  date: string;
  title: string;
  company: string;
  compensation: string;
  location: string;
  raw: string;
}
export function ledgerApplication(
  row: HistoryRow,
  source: string,
): Application | null {
  // Mere membership in Submitted or another role's confirmation is insufficient.
  const parts = row.raw.split(/(?<!\\)\|/);
  const narrative = parts.slice(7).join("|").trim();
  if (
    !/^(?:\*\*)?(?:Confirmed(?: on-screen)?\b|CONFIRMED\b|SUBMITTED AND CONFIRMED\b|Confirmation:)/i.test(
      narrative,
    )
  )
    return null;
  if (
    !/successfully submitted|submitted successfully|has been submitted|has been received|thank you for sending your application|application (?:has been|was) received|thank(?:s| you) for (?:applying|your (?:application|interest))|application submitted|we(?:'|’)ve received your application/i.test(
      narrative,
    )
  )
    return null;
  const id = `live-${row.key.slice(0, 20)}`,
    eid = `${id}-ledger`;
  return {
    id,
    company: row.company,
    title: row.title,
    location: row.location.slice(0, 200),
    compensation: row.compensation.slice(0, 1000),
    theme: applicationScene({ location: row.location, theme: "neutral" }),
    status: "pending",
    submitted: row.date,
    asOf: row.date,
    verification:
      "Contemporaneous ledger records explicit ATS confirmation; subsequent outcomes require reconciliation.",
    events: [
      {
        id: `${id}-submitted`,
        stage: "applied",
        date: row.date,
        label: "Application submitted",
        detail: "The source ledger records a successful ATS confirmation.",
        kind: "submission",
        evidenceIds: [eid],
      },
    ],
    evidence: [
      {
        id: eid,
        label: "Recorded ATS confirmation",
        kind: "receipt",
        text: row.raw,
        basis: `Source ledger: ${source}. Agent transcription, not a newly fetched employer receipt.`,
      },
    ],
  };
}
export function reconcileOpportunities(
  opportunities: Opportunity[],
  apps: Application[],
): Opportunity[] {
  const confirmed = new Set<string>();
  for (const a of apps) {
    const urls = new Set(
      a.evidence.flatMap((e) =>
        [...e.text.matchAll(/https?:\/\/[^\s<>"`]+/g)].map((m) =>
          jobIdentity(a.company, a.title, m[0].replace(/[).,;]+$/, "")),
        ),
      ),
    );
    for (const o of opportunities) {
      if (
        normalize(o.company) !== normalize(a.company) ||
        normalize(o.title) !== normalize(a.title)
      )
        continue;
      if (o.url && urls.has(jobIdentity(o.company, o.title, o.url))) {
        confirmed.add(o.id);
        const eid = `${o.id}-crosswalk`;
        if (!a.evidence.some((e) => e.id === eid))
          a.evidence.push({
            id: eid,
            label: "Original opportunity record",
            kind: "note",
            text: JSON.stringify(o),
            basis:
              "Exact source URL crosswalk; original workbook description, URL and provenance preserved.",
          });
      }
    }
  }
  return opportunities.filter((o) => !confirmed.has(o.id));
}

export function receiptApplication(
  row: HistoryRow,
  source: string,
  path: string,
): Application | null {
  const heading =
    " " +
    source
      .split("\n")
      .slice(0, 3)
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ") +
    " ";
  const phrase = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  if (
    !heading.includes(" " + phrase(row.company) + " ") ||
    !heading.includes(" " + phrase(row.title) + " ")
  )
    return null;
  if (!source.includes(row.date)) return null;
  if (
    !/your application was successfully submitted|submitted successfully|has been submitted|has been received|thank you for your application|thank you for sending your application|application submitted!|we(?:'|’)ve received your application|thank(?:s| you) for applying/i.test(
      source,
    )
  )
    return null;
  // Receipt must assert an observed result, not instructions or unsubmitted drafts.
  if (
    !/confirmed|confirmation|submitted(?:\s*:|\s+on)|success panel|successfully submitted/i.test(
      source,
    )
  )
    return null;
  if (
    /(?:not submitted|no confirmation|unconfirmed|submission failed)/i.test(
      source.slice(0, 900),
    )
  )
    return null;
  const fake = {
    ...row,
    raw: `| ${row.date} | ${row.title} | ${row.company} | | ${row.location} | ATS | Confirmed on-screen "Your application was successfully submitted." |`,
  };
  const a = ledgerApplication(fake, path)!;
  a.evidence[0] = {
    id: `a-${digest(path).slice(0, 24)}-receipt`,
    label: "Submission confirmation",
    kind: "receipt",
    text: source,
    basis: "Local contemporaneous receipt recording observed ATS confirmation.",
    file: path,
    sha256: digest(source),
    mediaType: "text/plain",
  };
  a.events[0].evidenceIds = [a.evidence[0].id];
  a.verification =
    "Submission confirmed by matching local ATS receipt; later outcomes require reconciliation.";
  return a;
}

export interface DeclineMessage {
  id: string;
  date: string;
  subject: string;
  from: string;
  text: string;
  source_url: string;
}
export const isEmployerDecline = (text: string) =>
  /(?:we (?:have |have, )?decided|we(?:\'|’)ve decided) to (?:move (?:forward|ahead)|proceed|continue) with (?:other candidates|another candidate)|(?:we (?:will |are |have decided )?|we(?:\'|’)re )not (?:to |be )?(?:move|moving|proceed|progress)(?:ing)? (?:forward|further|with your (?:application|candidacy))|your application.{0,40}(?:not selected|unsuccessful)|did not find a match|position (?:has been|was) filled/i.test(
    text,
  );
export interface HistoryScope {
  year?: number;
  recipientName?: string;
}
function inHistoryYear(date: string, scope: HistoryScope): boolean {
  const year = scope.year ?? new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1900 || year > 9999)
    throw new Error("History year must be an integer from 1900 to 9999.");
  return /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(date) && date.startsWith(`${year}-`);
}
export function joinDeclines(
  apps: Application[],
  messages: DeclineMessage[],
  scope: HistoryScope = {},
) {
  const unmatched: DeclineMessage[] = [];
  const phrase = (s: string) =>
    ` ${s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()} `;
  for (const m of messages) {
    const body = phrase(`${m.subject} ${m.from} ${m.text}`),
      date = m.date.slice(0, 10);
    if (!inHistoryYear(date, scope) || !isEmployerDecline(m.text)) {
      unmatched.push(m);
      continue;
    }
    const matches = apps.filter(
      (a) =>
        (!a.submitted || a.submitted <= date) &&
        mentionsCompany(body, a.company) &&
        body.includes(phrase(a.title)),
    );
    if (matches.length !== 1) {
      unmatched.push(m);
      continue;
    }
    const a = matches[0],
      id = `mail-${m.id.replace(/[^a-zA-Z0-9_-]/g, "")}`,
      eid = `${id}-evidence`;
    if (a.events.some((e) => e.id === id)) continue;
    a.evidence.push({
      id: eid,
      label: "Employer decision",
      kind: "feedback",
      text: m.text,
      basis: `Previously verified employer message: ${m.source_url}`,
    });
    a.events.push({
      id,
      stage: null,
      date,
      label: "Employer declined",
      detail: "Employer decision; no interview stage inferred.",
      kind: "decision",
      evidenceIds: [eid],
    });
    if (date >= a.asOf) {
      a.status = "rejected";
      a.asOf = date;
    }
  }
  return unmatched;
}

export function isIncompleteApplicationMessage(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ");
  return /(?:have not|has not|had not|haven['’]t|hasn['’]t|hadn['’]t|did not|didn['’]t|not|never) (?:yet )?(?:received?|submitted?) (?:your |the |an |this )?application|(?:your |the )?application (?:has |have |had |is |was )?(?:not |never |hasn['’]t |haven['’]t |wasn['’]t )(?:been )?(?:yet )?(?:received|submitted|complete)|(?:please|must|need to|remember to|(?:^|[.!?,]\s+|in order )to) (?:finish|complete|submit) (?:your |the |this )application|(?:your |the )application is incomplete|verification code|verify your email/i.test(
    normalized,
  );
}
export function applicationsFromDeclines(
  rows: HistoryRow[],
  apps: Application[],
  messages: DeclineMessage[],
  scope: HistoryScope = {},
): Application[] {
  const phrase = (s: string) =>
    ` ${s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()} `;
  const additions: Application[] = [];
  for (const m of messages) {
    if (
      !inHistoryYear(m.date, scope) ||
      isIncompleteApplicationMessage(`${m.subject} ${m.text}`) ||
      !/your application|your candidacy|thank you for applying|thanks for.*apply|you(?:'|’)ve applied|you applied/i.test(
        `${m.subject} ${m.text}`,
      )
    )
      continue;
    const body = phrase(`${m.subject} ${m.from} ${m.text}`);
    if (
      apps.some(
        (a) =>
          mentionsCompany(body, a.company) && body.includes(phrase(a.title)),
      )
    )
      continue;
    const hits = rows.filter(
      (r) => mentionsCompany(body, r.company) && body.includes(phrase(r.title)),
    );
    const distinct = new Map(
      hits.map((r) => [`${normalize(r.company)}|${normalize(r.title)}`, r]),
    );
    if (distinct.size !== 1) continue;
    const row = [...distinct.values()][0];
    if (
      additions.some(
        (a) =>
          normalize(a.company) === normalize(row.company) &&
          normalize(a.title) === normalize(row.title),
      )
    )
      continue;
    const a = ledgerApplication(
      {
        ...row,
        raw: `| ${row.date} | ${row.title} | ${row.company} | | ${row.location} | ATS | Confirmed on-screen "Your application was successfully submitted." |`,
      },
      "",
    )!;
    a.submitted = null;
    a.asOf = m.date.slice(0, 10);
    a.verification =
      "Employer message acknowledges this application; exact submission date remains unknown.";
    a.evidence = [
      {
        id: `${a.id}-ack`,
        label: "Employer acknowledges application",
        kind: "receipt",
        text: m.text,
        basis: `Previously verified employer correspondence: ${m.source_url}. Submission date is unknown; ledger-reported date ${row.date} is not promoted to confirmed.`,
      },
    ];
    a.events = [
      {
        id: `${a.id}-submitted`,
        stage: "applied",
        date: null,
        label: "Application acknowledged",
        detail:
          "Employer correspondence acknowledges this application. Exact submission date is unknown.",
        kind: "submission",
        evidenceIds: [a.evidence[0].id],
      },
    ];
    additions.push(a);
  }
  return additions;
}

export function joinConfirmations(
  rows: HistoryRow[],
  apps: Application[],
  messages: DeclineMessage[],
  scope: HistoryScope = {},
) {
  const unmatched: DeclineMessage[] = [];
  const phrase = (s: string) =>
    ` ${s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()} `;
  for (const m of messages) {
    if (
      !inHistoryYear(m.date, scope) ||
      isIncompleteApplicationMessage(`${m.subject} ${m.text}`) ||
      !/thank(?:s| you) for (?:applying|your application)|received your application|application (?:has been received|was successfully submitted)/i.test(
        m.text,
      )
    ) {
      unmatched.push(m);
      continue;
    }
    if (
      /verification code|verify your email|complete your application/i.test(
        m.subject,
      )
    ) {
      unmatched.push(m);
      continue;
    }
    const body = phrase(`${m.subject} ${m.from} ${m.text}`),
      day = m.date.slice(0, 10);
    const candidates = rows.filter(
      (r) =>
        mentionsCompany(body, r.company) &&
        body.includes(phrase(r.title)) &&
        Math.abs(Date.parse(day) - Date.parse(r.date)) <= 3 * 86400000,
    );
    const distinct = new Map(candidates.map((r) => [r.key, r]));
    if (distinct.size !== 1) {
      unmatched.push(m);
      continue;
    }
    const row = [...distinct.values()][0];
    let app = apps.find(
      (a) =>
        a.id === `live-${row.key.slice(0, 20)}` ||
        (a.submitted === row.date &&
          normalize(a.company) === normalize(row.company) &&
          normalize(a.title) === normalize(row.title)),
    );
    if (!app) {
      app = ledgerApplication(
        {
          ...row,
          raw: `| ${row.date} | ${row.title} | ${row.company} | | ${row.location} | ATS | Confirmed on-screen "Your application was successfully submitted." |`,
        },
        "",
      )!;
      app.submitted = day === row.date ? row.date : null;
      app.events[0].date = app.submitted;
      app.events[0].detail = "Employer email acknowledges this application.";
      app.evidence = [];
      app.verification =
        "Employer confirmation email matched to exact company and role; submission date unknown when source dates differ.";
      apps.push(app);
    }
    const eid = `confirmation-${m.id}`;
    if (app.evidence.some((e) => e.id === eid)) continue;
    app.evidence.push({
      id: eid,
      label: "Employer application acknowledgment",
      kind: "receipt",
      text: m.text,
      basis: `Gmail message read in full: ${m.source_url}; received ${m.date}.`,
    });
    if (
      !app.events[0].evidenceIds.length ||
      !app.evidence.some((e) => e.id === app.events[0].evidenceIds[0])
    )
      app.events[0].evidenceIds = [eid];
  }
  return unmatched;
}

export function extractStandaloneConfirmations(
  apps: Application[],
  messages: DeclineMessage[],
  scope: HistoryScope = {},
) {
  const recipientName = scope.recipientName?.trim();
  if (!recipientName) return 0;
  const escapedName = recipientName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const greeting = new RegExp(
    `(?:^|\\s)(?:Hi|Dear|Hello)\\s+${escapedName}(?=[,!:]|\\s*[\\r\\n]|$)`,
    "iu",
  );
  let added = 0;
  for (const m of messages) {
    const text = m.text.replace(/\s+/g, " ").trim();
    if (
      !inHistoryYear(m.date, scope) ||
      isIncompleteApplicationMessage(`${m.subject} ${m.text}`) ||
      !greeting.test(m.text.slice(0, 150))
    )
      continue;
    const match = text
      .slice(0, 1500)
      .match(
        /(?:thank you for applying (?:for|to)|received your application for) (?:the )?(.{3,180}?) (?:role|position) at (.{2,100}?)[.!]/i,
      );
    if (!match) continue;
    const title = match[1].trim(),
      company = match[2].split(/\s+[—–]\s+|, and /)[0].trim();
    if (/[<>]|https?:|\b(?:our|us|your)\b/i.test(company)) continue;
    if (
      apps.some((a) =>
        (() => {
          const existing = normalize(a.company.split(" (")[0]).replace(
              /(?:inc|llc|holding)$/,
              "",
            ),
            incoming = normalize(company).replace(/(?:inc|llc|holding)$/, "");
          return (
            existing === incoming ||
            (Math.min(existing.length, incoming.length) >= 5 &&
              (existing.startsWith(incoming) || incoming.startsWith(existing)))
          );
        })(),
      )
    )
      continue;
    const id = `mail-app-${m.id}`,
      eid = `${id}-ack`,
      date = m.date.slice(0, 10);
    apps.push({
      id,
      company,
      title,
      location: "",
      theme: "neutral",
      compensation: "",
      status: "pending",
      submitted: null,
      asOf: date,
      verification:
        "Employer email explicitly names this application and role. Exact submission date, location and resume remain unknown.",
      events: [
        {
          id: `${id}-submitted`,
          stage: "applied",
          date: null,
          label: "Application acknowledged",
          detail: `Employer acknowledgment received ${date}; exact submission day unknown.`,
          kind: "submission",
          evidenceIds: [eid],
        },
      ],
      evidence: [
        {
          id: eid,
          label: "Employer application acknowledgment",
          kind: "receipt",
          text: m.text,
          basis: `Gmail message read in full: ${m.source_url}; received ${m.date}.`,
        },
      ],
    });
    added++;
  }
  return added;
}
