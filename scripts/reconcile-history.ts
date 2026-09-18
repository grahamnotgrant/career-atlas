import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { ledgerRows } from "../server/source-watcher";
import {
  workbookOpportunities,
  ledgerApplication,
  reconcileOpportunities,
  digest,
  normalize,
  receiptApplication,
  joinDeclines,
  isEmployerDecline,
  joinConfirmations,
  extractStandaloneConfirmations,
  applicationsFromDeclines,
} from "../shared/history";
import { companyIdentity, opportunitySchema } from "../shared/career";
import { manifestSchema, type Application } from "../shared/model";
const [ledgerArg, workbookArg, outArg, existingArg, evidenceArg] =
  process.argv.slice(2);
if (!ledgerArg || !workbookArg || !outArg)
  throw new Error(
    "Usage: tsx scripts/reconcile-history.ts ledger.md workbook.xlsx private-output-dir [existing-manifest.json]. Dry run only; writes review artifacts, never the live database.",
  );
const year = Number(process.env.CAREER_ATLAS_YEAR ?? new Date().getFullYear());
if (!Number.isInteger(year) || year < 1900 || year > 9999)
  throw new Error("CAREER_ATLAS_YEAR must be an integer from 1900 to 9999.");
const scope = { year, recipientName: process.env.CAREER_ATLAS_RECIPIENT_NAME };
const ledger = resolve(ledgerArg),
  workbook = resolve(workbookArg),
  out = resolve(outArg),
  now = new Date().toISOString();
const sourceVersion = (p: string) => {
  const s = statSync(p);
  return `${s.size}:${s.mtimeMs}`;
};
const versions = [sourceVersion(ledger), sourceVersion(workbook)];
// Python standard library keeps XLSX parsing offline and avoids executing workbook macros.
const py = `import zipfile,xml.etree.ElementTree as E,json,sys,re
n={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as z:
 if sum(i.file_size for i in z.infolist())>100000000: raise ValueError('Workbook too large')
 s=[''.join(e.itertext()) for e in E.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si',n)] if 'xl/sharedStrings.xml' in z.namelist() else []
 rows=[]
 for r in E.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//m:row',n):
  d={}
  for c in r.findall('m:c',n):
   v=c.find('m:v',n); i=c.find('m:is',n); t=v.text if v is not None else ''.join(i.itertext()) if i is not None else ''
   d[re.sub(r'[0-9]','',c.get('r'))]=s[int(t)] if c.get('t')=='s' else t or ''
  rows.append(d)
 print(json.dumps([{rows[0].get(k,k):v for k,v in r.items()} for r in rows[1:]]))`;
const rows = JSON.parse(
  execFileSync("python3", ["-c", py, workbook], {
    maxBuffer: 30_000_000,
  }).toString(),
);
const opportunities = workbookOpportunities(rows, workbook, now),
  ledgerText = readFileSync(ledger, "utf8"),
  entries = ledgerRows(ledgerText, year);
const preserved: Application[] = existingArg
  ? manifestSchema.parse(JSON.parse(readFileSync(resolve(existingArg), "utf8")))
      .applications
  : [];
const apps = [...preserved],
  seen = new Set(
    apps.map(
      (a) => `${a.submitted}|${normalize(a.company)}|${normalize(a.title)}`,
    ),
  ),
  unresolved = [];
const receiptDir = join(dirname(ledger), "receipts");
const receipts = existsSync(receiptDir)
  ? readdirSync(receiptDir)
      .filter((n) => n.endsWith(".txt") && /confirmation/.test(n))
      .map((n) => {
        const path = join(receiptDir, n);
        return { path, text: readFileSync(path, "utf8") };
      })
  : [];
const receiptClaims = new Set<string>();
const duplicateClaims: unknown[] = [];
for (const row of entries) {
  const key = `${row.date}|${normalize(row.company)}|${normalize(row.title)}`;
  if (seen.has(key)) continue;
  const app =
    receipts
      .map((r) => receiptApplication(row, r.text, r.path))
      .find(Boolean) || ledgerApplication(row, ledger);
  if (app) {
    const receipt = app.evidence.find((e) => e.file)?.file;
    if (receipt && receiptClaims.has(receipt)) {
      duplicateClaims.push({
        company: row.company,
        title: row.title,
        date: row.date,
        receipt,
        reason: "One receipt linked to multiple ledger claims; retained once.",
      });
      continue;
    }
    if (receipt) receiptClaims.add(receipt);
    apps.push(app);
    seen.add(key);
  } else
    unresolved.push({
      company: row.company,
      title: row.title,
      date: row.date,
      reason:
        "No explicit leading ATS confirmation in this row; needs receipt/email match.",
      sourceRow: row.raw,
    });
}
const messages = evidenceArg
  ? JSON.parse(
      readFileSync(
        join(resolve(evidenceArg), "verified-decline-message-subset.json"),
        "utf8",
      ),
    ).events
  : [];
if (evidenceArg) {
  const extra = join(resolve(evidenceArg), `additional-${year}-declines.json`);
  if (existsSync(extra)) {
    const ids = new Set(messages.map((m: { id: string }) => m.id));
    for (const m of JSON.parse(readFileSync(extra, "utf8")))
      if (!ids.has(m.id)) {
        messages.push(m);
        ids.add(m.id);
      }
  }
}
const inboxFile = join(out, "inbox-confirmations.json");
const unmatchedConfirmations = existsSync(inboxFile)
  ? joinConfirmations(
      entries,
      apps,
      JSON.parse(readFileSync(inboxFile, "utf8")),
      scope,
    )
  : [];
const standaloneConfirmations = existsSync(inboxFile)
  ? extractStandaloneConfirmations(
      apps,
      JSON.parse(readFileSync(inboxFile, "utf8")),
      scope,
    )
  : 0;
if (existsSync(inboxFile)) {
  const ids = new Set(messages.map((m: { id: string }) => m.id));
  for (const m of JSON.parse(readFileSync(inboxFile, "utf8")))
    if (!ids.has(m.id)) {
      messages.push(m);
      ids.add(m.id);
    }
}
apps.push(...applicationsFromDeclines(entries, apps, messages, scope));
const unmatchedDecisions = joinDeclines(
  apps,
  messages.filter(
    (m: { event?: string; text: string }) =>
      m.event === "employer_decline" || isEmployerDecline(m.text),
  ),
  scope,
);
const confirmedTitles = new Set(
  apps.map((a) => `${normalize(a.company)}|${normalize(a.title)}`),
);
for (let i = unresolved.length - 1; i >= 0; i--)
  if (
    confirmedTitles.has(
      `${normalize(unresolved[i].company)}|${normalize(unresolved[i].title)}`,
    )
  )
    unresolved.splice(i, 1);
const unmatchedInterviews: unknown[] = [];
const interviewMailPath = join(out, "inbox-interviews.json");
const interviewMail = existsSync(interviewMailPath)
  ? JSON.parse(readFileSync(interviewMailPath, "utf8"))
  : [];
if (evidenceArg) {
  const records = JSON.parse(
    readFileSync(
      join(resolve(evidenceArg), "interview-process-evidence.json"),
      "utf8",
    ),
  ).records;
  for (const record of records) {
    const hits = apps.filter(
      (a) =>
        normalize(a.company.split(" (")[0]) === normalize(record.company) &&
        normalize(a.title) === normalize(record.role),
    );
    if (hits.length !== 1 || !record.invited_or_interview_evidenced) {
      unmatchedInterviews.push(record);
      continue;
    }
    const a = hits[0];
    if (a.events.some((e) => e.kind === "invitation" || e.kind === "interview"))
      continue;
    const eid = `interview-${record.evidence_message_id}`;
    const message = interviewMail.find(
      (m: { id: string }) => m.id === record.evidence_message_id,
    );
    const observed = message
      ? new Date(message.date).toISOString().slice(0, 10)
      : null;
    const recruiter =
      message &&
      /Recruiter Interview|Talent Acquisition|Talent Attraction Manager/i.test(
        message.text,
      );
    a.evidence.push({
      id: eid,
      label: "Recruiting conversation evidence",
      kind: "note",
      text: message?.text || JSON.stringify(record, null, 2),
      basis: `Previously audited message ${record.source_url}; exact round and date remain unclassified.`,
    });
    a.events.push({
      id: `${eid}-event`,
      stage: recruiter ? "recruiter" : null,
      date: observed,
      label: "Interview invitation",
      detail: message
        ? "Employer invitation received on this date. Scheduled interview details are in the source; completion is not inferred."
        : "Invitation or recruiting conversation evidenced. Exact stage, date and completion remain unverified.",
      kind: "invitation",
      evidenceIds: [eid],
    });
    if (a.status === "pending") a.status = "interview";
  }
}
let verifiedResumeFiles = 0;
for (const a of apps) {
  if (a.evidence.some((e) => e.kind === "resume")) continue;
  for (const e of [...a.evidence]) {
    if (e.kind !== "receipt") continue;
    const relative = e.text.match(
      /(?:Resume|PDF)(?: file| path)?\s*:\s*`?((?:outputs|resume[^ /]*)\/[^\n`]+\.pdf)/i,
    )?.[1];
    const expected = e.text.match(/SHA[- ]?256\s*:\s*([a-f0-9]{64})/i)?.[1];
    if (!relative || !expected) continue;
    const file = resolve(dirname(ledger), relative);
    if (
      !existsSync(file) ||
      !realpathSync(file).startsWith(realpathSync(dirname(ledger)) + "/")
    )
      continue;
    const sha = digest(readFileSync(file));
    if (sha !== expected) continue;
    a.evidence.push({
      id: `${a.id}-resume`,
      label: "Resume recorded in receipt",
      kind: "resume",
      text: "Local resume bytes match the full SHA-256 recorded in the submission receipt. Browser-side upload hashing is only confirmed where the receipt states it.",
      basis: "Exact path and full hash in contemporaneous receipt.",
      file,
      sha256: sha,
      mediaType: "application/pdf",
    });
    verifiedResumeFiles++;
    break;
  }
}
const pending = reconcileOpportunities(opportunities, apps);
const manifest = manifestSchema.parse({
  version: 1,
  label: `${year} application history`,
  mode: "private",
  coverage:
    "Reconciled explicit ledger ATS confirmations plus preserved evidence. Older unconfirmed claims remain separate; employer outcomes and exact uploaded resumes are not fully reconciled.",
  applications: apps,
});

for (const row of unresolved) {
  const hits = pending.filter(
    (o) =>
      normalize(o.company) === normalize(row.company) &&
      normalize(o.title) === normalize(row.title),
  );
  const id = `claim-${digest(`${row.company}|${row.title}|${row.date}`).slice(0, 24)}`;
  const provenance = {
    id: `${id}-source`,
    kind: "source" as const,
    text: row.sourceRow,
    source: ledger,
    recordedAt: now,
  };
  if (hits.length === 1) {
    hits[0].lifecycle = "uncertain";
    hits[0].provenance.push(provenance);
  } else if (!hits.length)
    pending.push(
      opportunitySchema.parse({
        id,
        company: row.company,
        companyKey: companyIdentity(row.company),
        title: row.title,
        jobKey: `ledger:${id}`,
        url: "",
        description: row.reason,
        location: "",
        lifecycle: "uncertain",
        provenance: [provenance],
      }),
    );
}

const report = {
  generatedAt: now,
  year,
  sourceHashes: {
    ledger: digest(ledgerText),
    workbook: digest(readFileSync(workbook)),
  },
  workbookRows: rows.length,
  distinctOpportunityKeys: opportunities.length,
  ledgerRows: entries.length,
  confirmedApplications: apps.length,
  unresolvedLedgerClaims: unresolved.length,
  unsubmittedOpportunities: pending.length,
  duplicateReceiptClaims: duplicateClaims,
  standaloneConfirmations,
  unmatchedConfirmationMessages: unmatchedConfirmations.length,
  unmatchedEmployerDecisions: unmatchedDecisions.length,
  unmatchedInterviewProcesses: unmatchedInterviews.length,
  newlyMatchedResumeFiles: verifiedResumeFiles,
  rejectionApplications: apps.filter((a) => a.status === "rejected").length,
  interviewApplications: apps.filter((a) => a.status === "interview").length,
  countsFinal: false,
  warnings: [
    "Workbook rows establish recorded discovery, not proof every full job description was reviewed.",
    "Different source URLs can refer to one requisition; ambiguous cross-source matches remain separate.",
    "No reply is not rejection. Outcome reconciliation and exact uploaded resume verification remain incomplete.",
    `Workbook snapshot scope is ${year} job search; rows mentioning prior-year history do not create prior-year applications.`,
  ],
};
if (
  versions[0] !== sourceVersion(ledger) ||
  versions[1] !== sourceVersion(workbook)
)
  throw new Error(
    "Source changed during reconciliation. Rerun to capture a stable snapshot.",
  );
mkdirSync(out, { recursive: true, mode: 0o700 });
for (const [name, data] of Object.entries({
  "manifest.json": manifest,
  "opportunities.json": pending,
  "unresolved.json": unresolved,
  "unmatched-decisions.json": unmatchedDecisions,
  "unmatched-confirmations.json": unmatchedConfirmations,
  "unmatched-interviews.json": unmatchedInterviews,
  "report.json": report,
}))
  writeFileSync(join(out, name), JSON.stringify(data, null, 2), {
    mode: 0o600,
  });
console.log(JSON.stringify(report, null, 2));
