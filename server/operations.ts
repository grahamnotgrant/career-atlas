import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  lstatSync,
  realpathSync,
  renameSync,
  rmSync,
  chmodSync,
} from "node:fs";
import {
  basename,
  dirname,
  join,
  resolve,
  relative,
  isAbsolute,
} from "node:path";
import { createHash, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";

const sha = (data: Buffer | string) =>
  createHash("sha256").update(data).digest("hex");
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
export type ExportSnapshot = {
  format: 1;
  createdAt: string;
  schemaVersion: number;
  revisions: Record<string, unknown>;
  tables: Record<string, Record<string, unknown>[]>;
};
function open(dir: string) {
  if (!existsSync(join(dir, "career.sqlite")))
    throw new Error("No canonical database in this directory.");
  const db = new DatabaseSync(join(dir, "career.sqlite"), { readOnly: true });
  db.exec("PRAGMA busy_timeout=5000;");
  return db;
}
export function exportSnapshot(dir: string): ExportSnapshot {
  const db = open(dir);
  try {
    db.exec("BEGIN");
    const tables: ExportSnapshot["tables"] = {};
    for (const { name } of db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[]) {
      tables[name] = db.prepare(`SELECT * FROM ${quote(name)}`).all() as Record<
        string,
        unknown
      >[];
    }
    const revisions: Record<string, unknown> = {};
    for (const row of tables.metadata ?? [])
      if (/revision|generation/.test(String(row.key)))
        revisions[String(row.key)] = row.value;
    for (const name of ["career_state", "view_state"])
      for (const row of tables[name] ?? []) {
        const body = typeof row.body === "string" ? JSON.parse(row.body) : row;
        if (row.revision !== undefined || body.revision !== undefined)
          revisions[name] = row.revision ?? body.revision;
      }
    const schemaVersion = Number(
      db.prepare("PRAGMA user_version").get()!.user_version,
    );
    db.exec("COMMIT");
    return {
      format: 1,
      createdAt: new Date().toISOString(),
      schemaVersion,
      revisions,
      tables,
    };
  } finally {
    db.close();
  }
}
function safePath(root: string, path: string) {
  if (
    !path ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw new Error("Unsafe backup path.");
  const target = resolve(root, path);
  if (relative(root, target).startsWith(".."))
    throw new Error("Unsafe backup path.");
  let current = root;
  for (const part of path.split("/")) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink())
      throw new Error("Symlinks are not allowed.");
  }
  return target;
}
function writeNew(path: string, data: Buffer | string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, data, { flag: "wx", mode: 0o600 });
}
function lock(dir: string) {
  const path = join(dir, ".operations.lock");
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch {
    throw new Error(
      "Another local operation owns .operations.lock. Retry after it finishes.",
    );
  }
  writeFileSync(
    join(path, "owner.json"),
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    { mode: 0o600 },
  );
  return () => rmSync(path, { recursive: true, force: true });
}
function destination(source: string, target: string) {
  let dest = resolve(target);
  if (existsSync(dest))
    throw new Error("Destination already exists. Choose a new path.");
  mkdirSync(dirname(dest), { recursive: true, mode: 0o700 });
  dest = join(realpathSync(dirname(dest)), basename(dest));
  const rel = relative(realpathSync(source), dest);
  if (
    !rel ||
    (!(rel === ".." || rel.startsWith("../") || rel.startsWith("..\\")) &&
      !isAbsolute(rel))
  )
    throw new Error("Destination must be outside the source directory.");
  return dest;
}
type BackupManifest = {
  format: 1;
  createdAt: string;
  revisions: Record<string, unknown>;
  files: Record<string, string>;
};
export function backupData(source: string, target: string) {
  source = realpathSync(source);
  const dest = destination(source, target),
    release = lock(source),
    temp = `${dest}.${randomUUID()}.tmp`;
  mkdirSync(temp, { mode: 0o700 });
  try {
    const db = open(source);
    try {
      db.prepare("VACUUM INTO ?").run(join(temp, "career.sqlite"));
    } finally {
      db.close();
    }
    chmodSync(join(temp, "career.sqlite"), 0o600);
    const snapshot = exportSnapshot(temp);
    // Immutable content-addressed evidence is copied after the SQLite snapshot.
    const required = new Set(
      (snapshot.tables.evidence ?? [])
        .map((row) => row.artifact)
        .filter((v): v is string => typeof v === "string"),
    );
    for (const artifact of required) {
      if (!/^[a-f0-9]{64}$/.test(artifact))
        throw new Error("Invalid evidence artifact name.");
      const data = readFileSync(safePath(source, `artifacts/${artifact}`));
      if (sha(data) !== artifact) throw new Error("Evidence hash mismatch.");
      writeNew(join(temp, "artifacts", artifact), data);
    }
    // Include the remaining local user files, excluding runtime secrets and derived outputs.
    const excluded = new Set([
      "career.sqlite",
      "career.sqlite-wal",
      "career.sqlite-shm",
      "control-token",
      ".operations.lock",
      "backups",
      "exports",
      "logs",
    ]);
    function copyTree(rel = "") {
      for (const name of readdirSync(join(source, rel))) {
        if (!rel && excluded.has(name)) continue;
        const path = rel ? `${rel}/${name}` : name,
          full = safePath(source, path),
          stat = lstatSync(full);
        if (stat.isDirectory()) copyTree(path);
        else if (stat.isFile() && !existsSync(join(temp, path)))
          writeNew(join(temp, path), readFileSync(full));
        else if (!stat.isFile())
          throw new Error("Unsupported file in data directory.");
      }
    }
    copyTree();
    const files: Record<string, string> = {};
    function inventory(rel = "") {
      for (const name of readdirSync(join(temp, rel))) {
        const path = rel ? `${rel}/${name}` : name;
        if (lstatSync(join(temp, path)).isDirectory()) inventory(path);
        else files[path] = sha(readFileSync(join(temp, path)));
      }
    }
    inventory();
    const manifest: BackupManifest = {
      format: 1,
      createdAt: snapshot.createdAt,
      revisions: snapshot.revisions,
      files,
    };
    writeNew(join(temp, "backup.json"), JSON.stringify(manifest, null, 2));
    renameSync(temp, dest);
    return { path: dest, ...manifest };
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  } finally {
    release();
  }
}
export function restoreData(backup: string, target: string) {
  backup = realpathSync(backup);
  const dest = destination(backup, target),
    temp = `${dest}.${randomUUID()}.tmp`;
  const manifest = JSON.parse(
    readFileSync(safePath(backup, "backup.json"), "utf8"),
  ) as BackupManifest;
  if (
    manifest.format !== 1 ||
    !manifest.files ||
    typeof manifest.files !== "object" ||
    !manifest.files["career.sqlite"]
  )
    throw new Error("Invalid backup manifest.");
  mkdirSync(temp, { mode: 0o700 });
  try {
    for (const [path, digest] of Object.entries(manifest.files)) {
      if (
        [
          "control-token",
          "backup.json",
          "career.sqlite-wal",
          "career.sqlite-shm",
          ".operations.lock",
        ].includes(path.split("/")[0]) ||
        !/^[a-f0-9]{64}$/.test(digest)
      )
        throw new Error("Invalid backup entry.");
      const input = safePath(backup, path),
        output = safePath(temp, path);
      if (!lstatSync(input).isFile())
        throw new Error("Backup entry is not a file.");
      const data = readFileSync(input);
      if (sha(data) !== digest)
        throw new Error(`Backup hash mismatch: ${path}`);
      writeNew(output, data);
    }
    const db = open(temp);
    try {
      if (db.prepare("PRAGMA integrity_check").get()!.integrity_check !== "ok")
        throw new Error("Database integrity check failed.");
      if (db.prepare("PRAGMA foreign_key_check").all().length)
        throw new Error("Database foreign key check failed.");
    } finally {
      db.close();
    }
    renameSync(temp, dest);
    return { path: dest, revisions: manifest.revisions };
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}
function rowsFor(table: Record<string, unknown>[]) {
  return table.map((row) => {
    if (typeof row.body !== "string") return row;
    try {
      return { ...row, ...JSON.parse(row.body), body: undefined };
    } catch {
      return row;
    }
  });
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function objects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object) : [];
}
/** Joined sheets for people; raw tables and the JSON companion preserve every field. */
function readableSheets(
  snapshot: ExportSnapshot,
): Record<string, Record<string, unknown>[]> {
  const applications = rowsFor(snapshot.tables.applications ?? []);
  const opportunities = rowsFor(snapshot.tables.opportunities ?? []);
  const state = rowsFor(snapshot.tables.career_state ?? [])[0] ?? {};
  const families = objects(state.families),
    templates = objects(state.templates);
  const appById = new Map(applications.map((a) => [a.id, a]));
  const familyById = new Map(families.map((f) => [f.id, f.name]));
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const events = rowsFor(snapshot.tables.events ?? []),
    evidence = rowsFor(snapshot.tables.evidence ?? []);
  const projected = new Set(opportunities.map((o) => o.applicationId));
  const records = [
    ...opportunities,
    ...applications
      .filter((a) => !projected.has(a.id))
      .map((a) => ({
        ...a,
        applicationId: a.id,
        lifecycle: "confirmed",
        submittedAt: a.submitted,
      })),
  ];
  const textList = (value: unknown) =>
    Array.isArray(value) ? value.map(String).join("\n") : "";
  return {
    "Search records": records.map((o) => {
      const a = appById.get(o.applicationId),
        compensation = object(o.compensation),
        t = templateById.get(o.templateId);
      return {
        "Record ID": o.id,
        "Application ID": o.applicationId,
        Company: o.company,
        "Original title": o.title,
        "Role family": familyById.get(o.roleFamilyId) ?? "Unmatched",
        Workflow: o.lifecycle,
        Outcome: a?.status ?? "No confirmed submission",
        Location: o.location,
        "Work arrangement": o.workArrangement,
        "Submission date": o.submittedAt ?? a?.submitted ?? "Unknown",
        "Resume template": t
          ? `${String(familyById.get(t.familyId) ?? t.familyId)} · v${String(t.version)}`
          : "Not recorded",
        Currency: compensation.currency,
        "Annual base": compensation.annualBase,
        "Annual cash": compensation.annualCash,
        "Compensation source text":
          typeof o.compensation === "string" ? o.compensation : undefined,
        "Job URL": o.url,
        "Job description": o.description,
        "Application answers": o.answers,
        "Material SHA-256": textList(o.materialHashes),
      };
    }),
    "Role families": families.map((f) => ({
      Rank: f.rank,
      "Role family": f.name,
      "Fit rationale": f.rationale,
      "Supporting evidence": textList(f.evidence),
      "Family ID": f.id,
    })),
    "Resume templates": templates.map((t) => ({
      "Template ID": t.id,
      "Role family": familyById.get(t.familyId),
      Version: t.version,
      "Approved at": t.approvedAt,
      "Approval note": t.approvalNote,
      Content: t.content,
      "Supported claims": textList(t.claims),
    })),
    "Event history": events.map((e) => ({
      Company: appById.get(e.application_id)?.company,
      "Original title": appById.get(e.application_id)?.title,
      "Application ID": e.application_id,
      "Event ID": e.id,
      Date: e.date ?? "Unknown",
      Stage: e.stage ?? "Unclassified",
      Kind: e.kind,
      Label: e.label,
      Detail: e.detail,
      "Evidence IDs": textList(e.evidenceIds),
    })),
    "Evidence detail": evidence.map((e) => ({
      Company: appById.get(e.application_id)?.company,
      "Original title": appById.get(e.application_id)?.title,
      "Application ID": e.application_id,
      "Evidence ID": e.id,
      Kind: e.kind,
      Label: e.label,
      Text: e.text,
      Basis: e.basis,
      "SHA-256": e.sha256 ?? e.artifact,
    })),
    "Source notes": opportunities.flatMap((o) =>
      objects(o.provenance).map((p) => ({
        Company: o.company,
        "Original title": o.title,
        "Record ID": o.id,
        Provenance: p.kind,
        Source: p.source,
        "Recorded at": p.recordedAt,
        Text: p.text,
      })),
    ),
    "Offer terms": opportunities
      .filter((o) => o.offer)
      .map((o) => {
        const offer = object(o.offer);
        return {
          Company: o.company,
          "Original title": o.title,
          "Record ID": o.id,
          Currency: offer.currency,
          Base: offer.base,
          Bonus: offer.bonus,
          Equity: offer.equity,
          Location: offer.location,
          Deadline: offer.deadline,
          Decision: offer.decision,
        };
      }),
  };
}
export async function exportWorkbook(dir: string, target?: string) {
  const release = lock(dir);
  try {
    const snapshot = exportSnapshot(dir),
      workbook = new ExcelJS.Workbook();
    workbook.creator = "Career Atlas";
    workbook.created = new Date(snapshot.createdAt);
    const meta = workbook.addWorksheet("Read me");
    meta.addRows([
      ["Career Atlas", "Read-only projection; canonical records are in SQLite"],
      ["Exported at", snapshot.createdAt],
      ["Schema version", snapshot.schemaVersion],
      ["Revisions", JSON.stringify(snapshot.revisions)],
      [
        "Long text",
        "Cells over 32767 characters are shortened; accompanying JSON preserves full records.",
      ],
      [
        "Privacy",
        "Contains personal job-search records. Share only with intended recipients.",
      ],
    ]);
    meta.getColumn(1).width = 24;
    meta.getColumn(2).width = 90;
    for (const [table, records] of Object.entries({
      ...readableSheets(snapshot),
      ...snapshot.tables,
    })) {
      const rows = rowsFor(records),
        keys = [
          ...new Set(
            rows.flatMap((row) =>
              Object.keys(row).filter((k) => row[k] !== undefined),
            ),
          ),
        ];
      if (!keys.length) continue;
      const sheet = workbook.addWorksheet(table.slice(0, 31));
      sheet.columns = keys.map((key) => ({
        header: key,
        key,
        width: Math.min(60, Math.max(18, key.length + 2)),
      }));
      for (const row of rows)
        sheet.addRow(
          Object.fromEntries(
            keys.map((key) => {
              const value = row[key];
              return [
                key,
                value == null
                  ? ""
                  : typeof value === "number" || typeof value === "boolean"
                    ? value
                    : (typeof value === "string"
                        ? value
                        : JSON.stringify(value)
                      ).slice(0, 32767),
              ];
            }),
          ),
        );
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, sheet.rowCount), column: keys.length },
      };
      sheet.getRow(1).font = { bold: true };
    }
    const stamp = snapshot.createdAt.replaceAll(/[:.]/g, "-");
    let output = target
      ? resolve(target)
      : join(
          dir,
          "exports",
          `career-atlas-${stamp}-${randomUUID().slice(0, 8)}.xlsx`,
        );
    if (existsSync(output) || existsSync(`${output}.json`))
      throw new Error("Export destination already exists.");
    mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
    output = join(realpathSync(dirname(output)), basename(output));
    const buffer = await workbook.xlsx.writeBuffer();
    writeNew(output, Buffer.from(buffer));
    try {
      writeNew(`${output}.json`, JSON.stringify(snapshot, null, 2));
    } catch (error) {
      rmSync(output, { force: true });
      throw error;
    }
    return {
      path: output,
      jsonPath: `${output}.json`,
      revisions: snapshot.revisions,
      createdAt: snapshot.createdAt,
    };
  } finally {
    release();
  }
}
/** A projection failure never rolls back canonical records. The status file exposes lag. */
export function watchWorkbook(dir: string, intervalMs = 5000) {
  let stopped = false,
    busy = false,
    fingerprint = "";
  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const snapshot = exportSnapshot(dir);
      const next = sha(
        JSON.stringify(
          Object.fromEntries(
            Object.entries(snapshot.tables)
              .filter(
                ([name]) =>
                  ![
                    "commands",
                    "career_commands",
                    "view_state",
                    "view_history",
                  ].includes(name),
              )
              .map(([name, rows]) => [
                name,
                name === "metadata"
                  ? rows.filter((row) => !["sync"].includes(String(row.key)))
                  : rows,
              ]),
          ),
        ),
      );
      if (next === fingerprint) return;
      const result = await exportWorkbook(dir);
      const path = join(dir, "exports", "workbook-status.json"),
        temp = `${path}.${randomUUID()}.tmp`;
      writeNew(temp, JSON.stringify({ state: "current", ...result }, null, 2));
      renameSync(temp, path);
      fingerprint = next;
    } catch (error) {
      mkdirSync(join(dir, "exports"), { recursive: true, mode: 0o700 });
      const path = join(dir, "exports", "workbook-status.json"),
        temp = `${path}.${randomUUID()}.tmp`;
      try {
        writeNew(
          temp,
          JSON.stringify({
            state: "error",
            message: error instanceof Error ? error.message : String(error),
            checkedAt: new Date().toISOString(),
          }),
        );
        renameSync(temp, path);
      } catch {
        /* Retry without touching canonical data. */
      }
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
