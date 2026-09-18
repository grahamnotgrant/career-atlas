import { applicationScene } from "../shared/locations";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { z } from "zod";
import { Store, hash } from "./store";
import type { Application, Snapshot } from "../shared/model";
const configSchema = z.object({
  ledgerPath: z.string(),
  year: z.number().int().min(2000).max(2100),
  intervalMs: z.number().int().min(500).default(2000),
});
export const cleanText = (s: string) =>
  s
    .replace(/\*\*|`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
const norm = (s: string) =>
  cleanText(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
export interface LedgerRow {
  key: string;
  date: string;
  title: string;
  company: string;
  compensation: string;
  location: string;
  raw: string;
}
export function ledgerRows(text: string, year: number): LedgerRow[] {
  const match = text.match(/^## Submitted\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m);
  if (!match) throw new Error("Submitted section is unavailable.");
  const rows: LedgerRow[] = [];
  for (const line of match[1].split("\n")) {
    if (!line.startsWith("|")) continue;
    const parts = line
      .trim()
      .replace(/^\||\|$/g, "")
      .split(/(?<!\\)\|/)
      .map(cleanText);
    if (parts.length < 7 || !/^\d{2,4}-\d{2}(?:-\d{2})?$/.test(parts[0]))
      continue;
    const date = parts[0].length === 5 ? `${year}-${parts[0]}` : parts[0];
    if (!z.iso.date().safeParse(date).success || !date.startsWith(`${year}-`))
      continue;
    const key = hash(`${date}|${norm(parts[2])}|${norm(parts[1])}`);
    rows.push({
      key,
      date,
      title: parts[1],
      company: parts[2],
      compensation: parts[3],
      location: parts[4],
      raw: line,
    });
  }
  return rows;
}
export class SourceWatcher {
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastDigest = "";
  private config: z.infer<typeof configSchema> | undefined;
  constructor(private store: Store) {
    const path = join(store.dir, "source-watch.json");
    if (!existsSync(path)) return;
    try {
      this.config = configSchema.parse(JSON.parse(readFileSync(path, "utf8")));
      this.tick();
      this.timer = setInterval(() => this.tick(), this.config.intervalMs);
      this.timer.unref();
    } catch {
      this.status("error", "Source watcher configuration needs attention.");
    }
  }
  stop() {
    clearInterval(this.timer);
  }
  private status(state: string, message: string, added = 0) {
    const sync: Snapshot["sync"] = {
      enabled: true,
      state,
      checkedAt: new Date().toISOString(),
      added,
      message,
    };
    this.store.db
      .prepare(
        "INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run("sync", JSON.stringify(sync));
  }
  tick() {
    if (!this.config) return;
    try {
      if (this.store.meta("mode", "private") === "demo")
        throw new Error("A private source cannot feed a demo workspace.");
      const { ledgerPath, year } = this.config,
        text = readFileSync(ledgerPath, "utf8"),
        digest = hash(text);
      if (digest !== this.lastDigest) {
        this.lastDigest = digest;
        this.status(
          "settling",
          "Waiting for the source file to finish changing.",
        );
        return;
      }
      const rows = ledgerRows(text, year),
        statePath = join(this.store.dir, "source-watch-state.json");
      let state: { ledgerPath: string; seen: string[] };
      if (existsSync(statePath)) {
        state = JSON.parse(readFileSync(statePath, "utf8"));
        if (state.ledgerPath !== resolve(ledgerPath))
          throw new Error("Source changed; establish a new baseline.");
      } else {
        state = {
          ledgerPath: resolve(ledgerPath),
          seen: rows.map((r) => r.key),
        };
        this.save(statePath, state);
        this.status(
          "watching",
          "Watching for new confirmed applications. Earlier records await reconciliation.",
        );
        return;
      }
      const seen = new Set(state.seen),
        current = this.store.snapshot();
      const existing = new Set(
        current.applications.map((a) =>
          hash(`${a.submitted}|${norm(a.company)}|${norm(a.title)}`),
        ),
      );
      const pending = rows.filter((r) => !seen.has(r.key)),
        additions: Application[] = [];
      for (const row of pending) {
        if (seen.has(row.key)) continue;
        if (existing.has(row.key)) {
          seen.add(row.key);
          continue;
        }
        const app = this.fromRow(row, dirname(ledgerPath));
        if (app) {
          additions.push(app);
          seen.add(row.key);
        }
      }
      if (additions.length)
        this.store.importManifest(
          {
            version: 1,
            label: current.label,
            mode: "private",
            coverage:
              "Confirmed applications from the linked sources, with live additions as receipts arrive.",
            applications: additions,
          },
          dirname(ledgerPath),
        );
      this.save(statePath, { ledgerPath: state.ledgerPath, seen: [...seen] });
      const unresolved = pending.filter((row) => !seen.has(row.key)).length;
      this.status(
        unresolved ? "review" : "watching",
        additions.length
          ? `${additions.length} confirmed application${additions.length === 1 ? "" : "s"} added.`
          : unresolved
            ? `${unresolved} new source row${unresolved === 1 ? "" : "s"} waiting for matching confirmation evidence.`
            : "Application list is up to date.",
        additions.length,
      );
    } catch (e) {
      this.status("error", (e as Error).message);
    }
  }
  private save(path: string, value: unknown) {
    const temp = `${path}.tmp`;
    writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    renameSync(temp, path);
  }
  private fromRow(row: LedgerRow, root: string): Application | null {
    // Only explicit receipts can establish a new submission. Narrative mentions of
    // another role's rejection never change the status of this application.
    const receiptNames = [
      ...row.raw.matchAll(/receipts\/[a-zA-Z0-9_./-]+\.txt/g),
    ].map((m) => m[0]);
    for (const relative of receiptNames) {
      const path = resolve(root, relative);
      if (
        !existsSync(path) ||
        !realpathSync(path).startsWith(realpathSync(root) + sep)
      )
        continue;
      const before = statSync(path),
        source = readFileSync(path, "utf8"),
        after = statSync(path);
      if (before.mtimeMs !== after.mtimeMs || before.size !== after.size)
        continue;
      if (!relative.includes("confirmation")) continue;
      if (
        !norm(source.slice(0, 500)).includes(norm(row.company)) ||
        !norm(source.slice(0, 500)).includes(norm(row.title))
      )
        continue;
      if (
        !/your application was successfully submitted|thank(?:s| you) for applying|application has been received|application submitted!/i.test(
          source,
        )
      )
        continue;
      const id = `live-${row.key.slice(0, 20)}`,
        evidenceId = `${id}-receipt`;
      const theme = applicationScene({
        location: row.location,
        theme: "neutral",
      });
      return {
        id,
        company: row.company,
        title: row.title,
        location: row.location,
        compensation: row.compensation,
        theme,
        status: "pending",
        submitted: row.date,
        asOf: row.date,
        verification:
          "Submission confirmed by the linked local receipt. Later outcome reconciliation is pending.",
        events: [
          {
            id: `${id}-submitted`,
            stage: "applied",
            date: row.date,
            label: "Application submitted",
            detail:
              "The live application list links a receipt recording ATS confirmation.",
            evidenceIds: [evidenceId],
            kind: "submission",
          },
        ],
        evidence: [
          {
            id: evidenceId,
            label: "Submission confirmation",
            kind: "receipt",
            text: source,
            basis: "Linked confirmation receipt; original hash preserved.",
            file: path,
            sha256: hash(source),
            mediaType: "text/plain",
          },
        ],
      };
    }
    return null;
  }
}
