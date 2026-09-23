import { transaction } from "./transaction";
import { opportunitySchema } from "../shared/career";
import {
  CareerStore,
  migrateCareer,
  migrateTriage,
  NORMALIZE_TRIAGE,
} from "./career";
import { applicationScene, isScene } from "../shared/locations";
import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  initialView,
  manifestSchema,
  commandSchema,
  themeSchema,
  statusSchema,
  selectionSchema,
  evidenceSchema,
  eventSchema,
  type Application,
  type Snapshot,
  type View,
  type Command,
} from "../shared/model";
export class StoreError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const hash = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
export class Store {
  db: DatabaseSync;
  token: string;
  career: CareerStore;
  constructor(public dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    for (const name of ["artifacts", "imports", "exports", "backups", "logs"])
      mkdirSync(join(dir, name), { recursive: true, mode: 0o700 });
    const tokenPath = join(dir, "control-token");
    if (!existsSync(tokenPath)) {
      try {
        writeFileSync(tokenPath, randomBytes(32).toString("hex"), {
          mode: 0o600,
          flag: "wx",
        });
      } catch (e) {
        if (!existsSync(tokenPath)) throw e;
      }
    }
    this.token = readFileSync(tokenPath, "utf8").trim();
    chmodSync(tokenPath, 0o600);
    this.db = new DatabaseSync(join(dir, "career.sqlite"));
    this.db.exec(
      `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;`,
    );
    const version = (
      this.db.prepare("PRAGMA user_version").get() as { user_version: number }
    ).user_version;
    // Bump with every migration that changes user_version.
    if (version > 4) {
      this.db.close();
      throw new Error("Database version is newer than this app.");
    }
    if (version === 0)
      this.db.exec(`BEGIN IMMEDIATE;
   CREATE TABLE metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE applications (id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE events (id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),body TEXT NOT NULL);
   CREATE TABLE evidence (id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),body TEXT NOT NULL,artifact TEXT);
   CREATE TABLE view_state (id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL);
   CREATE TABLE commands (id TEXT PRIMARY KEY,request TEXT NOT NULL,response TEXT NOT NULL);
   CREATE TABLE imports (hash TEXT PRIMARY KEY,imported_at TEXT NOT NULL);
   PRAGMA user_version=1; COMMIT;`);
    if (version < 2) {
      if (version === 1)
        this.db
          .prepare("VACUUM INTO ?")
          .run(join(dir, "backups", `before-v2-${Date.now()}.sqlite`));
      this.db.exec(
        "BEGIN IMMEDIATE; CREATE TABLE IF NOT EXISTS view_history (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL); PRAGMA user_version=2; COMMIT;",
      );
    }
    if (version < 3) {
      this.db
        .prepare("VACUUM INTO ?")
        .run(join(dir, "backups", `before-v3-${Date.now()}.sqlite`));
      migrateCareer(this.db);
    }
    if (version < 4) {
      this.db
        .prepare("VACUUM INTO ?")
        .run(join(dir, "backups", `before-v4-${Date.now()}.sqlite`));
      migrateTriage(this.db);
    }
    this.db.exec(NORMALIZE_TRIAGE);
    this.db
      .prepare("INSERT OR IGNORE INTO metadata (key,value) VALUES (?,?)")
      .run("workspaceId", randomBytes(24).toString("hex"));
    this.career = new CareerStore(this.db, dir);
    this.db
      .prepare("INSERT OR IGNORE INTO view_state VALUES (1,?)")
      .run(JSON.stringify(initialView));
    if (version < 3) this.career.syncConfirmed(this.snapshot().applications);
    chmodSync(join(dir, "career.sqlite"), 0o600);
  }
  close() {
    this.db.close();
  }
  getView(): View {
    const view: View = {
      ...initialView,
      ...JSON.parse(
        (
          this.db.prepare("SELECT body FROM view_state WHERE id=1").get() as {
            body: string;
          }
        ).body,
      ),
    };
    // A runtime city can be removed while the view still shows it.
    if (!isScene(view.theme)) view.theme = "neutral";
    if (view.city && !isScene(view.city)) view.city = null;
    return view;
  }
  meta(key: string, fallback: string) {
    return (
      (
        this.db.prepare("SELECT value FROM metadata WHERE key=?").get(key) as
          { value: string } | undefined
      )?.value ?? fallback
    );
  }
  snapshot(): Snapshot {
    const apps = (
      this.db.prepare("SELECT body FROM applications ORDER BY id").all() as {
        body: string;
      }[]
    ).map((r) => JSON.parse(r.body) as Application);
    const byId = new Map(apps.map((a) => [a.id, a]));
    for (const a of apps) {
      a.events = [];
      a.evidence = [];
    }
    for (const row of this.db
      .prepare("SELECT application_id,body FROM events ORDER BY rowid")
      .all() as { application_id: string; body: string }[]) {
      byId.get(row.application_id)?.events.push(JSON.parse(row.body));
    }
    for (const row of this.db
      .prepare(
        "SELECT application_id,body,artifact FROM evidence ORDER BY rowid",
      )
      .all() as {
      application_id: string;
      body: string;
      artifact: string | null;
    }[]) {
      const body = JSON.parse(row.body);
      byId.get(row.application_id)?.evidence.push({
        ...body,
        file: row.artifact ? `/api/evidence/${body.id}/file` : undefined,
      });
    }
    return {
      workspaceId: this.meta("workspaceId", ""),
      career: this.career.snapshot(),
      applications: apps,
      homeLocation: JSON.parse(
        this.meta(
          "homeLocation",
          '{"status":"unset","label":null,"coordinates":null,"evidenceIds":[]}',
        ),
      ),
      view: this.getView(),
      generation: Number(this.meta("generation", "0")),
      label: this.meta("label", "Your career, in motion"),
      mode: this.meta("mode", "empty") as Snapshot["mode"],
      coverage: this.meta("coverage", "Import a dataset to begin."),
      canGoBack: !!this.db.prepare("SELECT id FROM view_history LIMIT 1").get(),
      sync: JSON.parse(
        this.meta(
          "sync",
          '{"enabled":false,"state":"off","checkedAt":null,"added":0,"message":"No source watcher configured."}',
        ),
      ),
    };
  }
  importManifest(raw: unknown, baseDir: string) {
    const m = manifestSchema.parse(raw),
      digest = hash(JSON.stringify(m));
    if (this.db.prepare("SELECT hash FROM imports WHERE hash=?").get(digest))
      return {
        changed: false,
        generation: Number(this.meta("generation", "0")),
      };
    if (this.meta("mode", m.mode) !== m.mode)
      throw new StoreError(
        409,
        "Private and demo data require separate directories.",
      );
    const staged = new Map<string, string>();
    for (const a of m.applications)
      for (const e of a.evidence)
        if (e.file) {
          const path = resolve(baseDir, e.file),
            data = readFileSync(path);
          if (data.length > 30 * 1024 * 1024)
            throw new Error("Evidence exceeds 30 MB.");
          const sha = hash(data);
          if (e.sha256 && sha !== e.sha256)
            throw new Error(`Evidence hash mismatch: ${e.id}`);
          if (
            e.mediaType === "application/pdf" &&
            data.subarray(0, 5).toString() !== "%PDF-"
          )
            throw new Error("Invalid PDF signature");
          const dest = join(this.dir, "artifacts", sha);
          if (!existsSync(dest)) {
            const tmp = `${dest}.${randomBytes(4).toString("hex")}.tmp`;
            writeFileSync(tmp, data, { mode: 0o600 });
            renameSync(tmp, dest);
          }
          staged.set(e.id, sha);
          e.sha256 = sha;
        }
    // An immutable manifest records the assertions behind each import; it is private data.
    const manifestPath = join(this.dir, "imports", `${digest}.json`);
    writeFileSync(manifestPath, JSON.stringify(m, null, 2), { mode: 0o600 });
    const tx = transaction(this.db);
    try {
      for (const a of m.applications) {
        this.db
          .prepare(
            "INSERT INTO applications VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
          )
          .run(a.id, JSON.stringify({ ...a, events: [], evidence: [] }));
        this.db.prepare("DELETE FROM events WHERE application_id=?").run(a.id);
        this.db
          .prepare("DELETE FROM evidence WHERE application_id=?")
          .run(a.id);
        for (const e of a.events)
          this.db
            .prepare("INSERT INTO events VALUES (?,?,?)")
            .run(e.id, a.id, JSON.stringify(e));
        for (const e of a.evidence) {
          const { file, ...safe } = e;
          this.db
            .prepare("INSERT INTO evidence VALUES (?,?,?,?)")
            .run(e.id, a.id, JSON.stringify(safe), staged.get(e.id) ?? null);
        }
      }
      this.career.syncConfirmed(m.applications);
      const generation = Number(this.meta("generation", "0")) + 1;
      for (const [k, v] of Object.entries({
        label: m.label,
        mode: m.mode,
        coverage: m.coverage,
        generation: String(generation),
      }))
        this.db
          .prepare(
            "INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          )
          .run(k, v);
      this.db
        .prepare("INSERT INTO imports VALUES (?,?)")
        .run(digest, new Date().toISOString());
      tx.commit();
      return { changed: true, generation };
    } catch (e) {
      tx.rollback();
      throw e;
    }
  }
  importHistory(raw: unknown, rawOpportunities: unknown, baseDir: string) {
    const opportunities = z
      .array(opportunitySchema)
      .max(10000)
      .parse(rawOpportunities);
    const tx = transaction(this.db);
    try {
      const imported = this.importManifest(raw, baseDir);
      const state = this.career.snapshot(),
        existing = new Set(state.opportunities.map((o) => o.id));
      const pending = opportunities.filter((o) => !existing.has(o.id));
      if (pending.length)
        this.career.command({
          id: `history-${hash(JSON.stringify(pending)).slice(0, 40)}`,
          expectedRevision: state.revision,
          action: "opportunities",
          payload: { opportunities: pending },
        });
      tx.commit();
      return {
        ...imported,
        opportunitiesAdded: pending.length,
        careerRevision: this.career.revision(),
      };
    } catch (e) {
      tx.rollback();
      throw e;
    }
  }
  command(raw: unknown) {
    const c = commandSchema.parse(raw);
    const tx = transaction(this.db);
    try {
      const prior = this.db
        .prepare("SELECT request,response FROM commands WHERE id=?")
        .get(c.id) as { request: string; response: string } | undefined;
      if (prior) {
        if (prior.request !== JSON.stringify(c))
          throw new StoreError(
            409,
            "Command ID already used with different arguments.",
          );
        tx.commit();
        return JSON.parse(prior.response) as { view: View; generation: number };
      }
      const view = this.getView();
      if (c.expectedRevision !== view.revision)
        throw new StoreError(
          409,
          "The view changed. Read its latest revision before retrying.",
        );
      if (c.action === "back") {
        z.object({}).strict().parse(c.payload);
        const previous = this.db
          .prepare("SELECT id,body FROM view_history ORDER BY id DESC LIMIT 1")
          .get() as { id: number; body: string } | undefined;
        if (previous) {
          const revision = view.revision;
          Object.assign(view, initialView, JSON.parse(previous.body), {
            revision,
          });
          this.db
            .prepare("DELETE FROM view_history WHERE id=?")
            .run(previous.id);
        }
      } else {
        const before = JSON.stringify(view);
        this.apply(view, c);
        if (
          [
            "select",
            "document",
            "flow",
            "list",
            "filter",
            "reset",
            "close",
          ].includes(c.action) &&
          before !== JSON.stringify(view)
        ) {
          this.db
            .prepare("INSERT INTO view_history(body) VALUES (?)")
            .run(before);
          this.db.exec(
            "DELETE FROM view_history WHERE id NOT IN (SELECT id FROM view_history ORDER BY id DESC LIMIT 100)",
          );
        }
      }
      view.revision++;
      const response = {
        view,
        canGoBack: !!this.db
          .prepare("SELECT id FROM view_history LIMIT 1")
          .get(),
        generation: Number(this.meta("generation", "0")),
      };
      this.db
        .prepare("UPDATE view_state SET body=? WHERE id=1")
        .run(JSON.stringify(view));
      this.db
        .prepare("INSERT INTO commands VALUES (?,?,?)")
        .run(c.id, JSON.stringify(c), JSON.stringify(response));
      tx.commit();
      return response;
    } catch (e) {
      tx.rollback();
      throw e;
    }
  }
  private apply(view: View, c: Command) {
    const p = c.payload;
    switch (c.action) {
      case "role": {
        const { id } = z
          .object({ id: z.string().nullable() })
          .strict()
          .parse(p);
        if (
          id !== null &&
          id !== "unmatched" &&
          !this.career.snapshot().families.some((f) => f.id === id)
        )
          throw new StoreError(404, "Role family not found.");
        view.roleFamilyId = id;
        view.selection = null;
        view.selectedId = null;
        view.evidenceId = null;
        view.list = false;
        view.query = "";
        view.status = "all";
        view.flowIds = null;
        break;
      }
      case "location": {
        const { city } = z
          .object({ city: themeSchema.nullable() })
          .strict()
          .parse(p);
        view.city = city;
        view.theme = city ?? "neutral";
        view.selection = null;
        view.selectedId = null;
        view.evidenceId = null;
        view.flowIds = null;
        view.list = false;
        view.query = "";
        view.status = "all";
        break;
      }
      case "select": {
        const { id } = z
          .object({ id: z.string().nullable() })
          .strict()
          .parse(p);
        if (id) {
          const row = this.db
            .prepare("SELECT body FROM applications WHERE id=?")
            .get(id) as { body: string } | undefined;
          if (!row) throw new StoreError(404, "Application not found.");
          const a = JSON.parse(row.body) as Application;
          view.theme = applicationScene(a);
          view.themeLocked = false;
        }
        view.selectedId = id;
        view.evidenceId = null;
        break;
      }
      case "document": {
        const { id } = z.object({ id: z.string() }).strict().parse(p);
        const row = this.db
          .prepare("SELECT application_id FROM evidence WHERE id=?")
          .get(id) as { application_id: string } | undefined;
        if (!row || row.application_id !== view.selectedId)
          throw new StoreError(
            404,
            "Evidence does not belong to the selected application.",
          );
        view.evidenceId = id;
        break;
      }
      case "close":
        z.object({}).strict().parse(p);
        view.selectedId = null;
        view.evidenceId = null;
        view.list = false;
        break;
      case "theme": {
        const args = z
          .object({ theme: themeSchema, locked: z.boolean().optional() })
          .strict()
          .parse(p);
        view.theme = args.theme;
        view.city = null;
        view.themeLocked = false;
        break;
      }
      case "close-silent": {
        // The user's own decision on applications nobody answered; the store
        // never closes an application from silence on its own.
        const { ids } = z
          .object({ ids: z.array(z.string()).min(1).max(10000) })
          .strict()
          .parse(p);
        const today = new Date().toISOString().slice(0, 10);
        for (const id of ids) {
          const row = this.db
            .prepare("SELECT body FROM applications WHERE id=?")
            .get(id) as { body: string } | undefined;
          if (!row) throw new StoreError(404, "Application not found.");
          const app = JSON.parse(row.body) as Application;
          if (app.status !== "pending")
            throw new StoreError(
              409,
              `${app.company} is not awaiting a reply.`,
            );
          const last =
            (
              this.db
                .prepare(
                  "SELECT body FROM events WHERE application_id=? ORDER BY rowid",
                )
                .all(id) as { body: string }[]
            )
              .map((e) => JSON.parse(e.body).date as string | null)
              .filter((d): d is string => !!d)
              .at(-1) ?? app.submitted;
          const days = last
            ? Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000)
            : null;
          if (days === null || days < 30)
            throw new StoreError(
              409,
              `${app.company} has not been silent for 30 days.`,
            );
          this.recordDecision(id, {
            status: "closed",
            date: today,
            label: "Closed by you after no reply",
            source: "user",
            text: `No employer reply for ${days} days after the last contact on ${last}; closed by the user on ${today}.`,
          });
        }
        view.selection = null;
        break;
      }
      case "selection": {
        const { selection } = z
          .object({ selection: selectionSchema })
          .strict()
          .parse(p);
        view.selection = selection;
        break;
      }
      case "motion":
        view.motion = z
          .object({ enabled: z.boolean() })
          .strict()
          .parse(p).enabled;
        break;
      case "flow": {
        const { ids } = z
          .object({ ids: z.array(z.string()).max(10000).nullable() })
          .strict()
          .parse(p);
        if (ids)
          for (const id of ids)
            if (
              !this.db.prepare("SELECT id FROM applications WHERE id=?").get(id)
            )
              throw new StoreError(404, "Application not found.");
        view.flowIds = ids;
        view.list = true;
        view.selectedId = null;
        view.evidenceId = null;
        break;
      }
      case "list": {
        const args = z
          .object({
            enabled: z.boolean(),
            preserveFlow: z.boolean().optional(),
          })
          .strict()
          .parse(p);
        if (!args.preserveFlow) view.flowIds = null;
        view.list = args.enabled;
        break;
      }
      case "filter": {
        const args = z
          .object({
            status: z.union([statusSchema, z.literal("all")]).optional(),
            query: z.string().max(200).optional(),
          })
          .strict()
          .parse(p);
        Object.assign(view, args);
        view.selectedId = null;
        view.evidenceId = null;
        view.flowIds = null;
        break;
      }
      case "reset":
        z.object({}).strict().parse(p);
        Object.assign(view, {
          ...initialView,
          revision: view.revision,
          motion: view.motion,
        });
        break;
    }
  }
  /** Attach a saved resume to a confirmed application. The file is staged by
      hash like an import; the label and basis say how the link was found. */
  attachResume(
    applicationId: string,
    link: { path: string; label: string; basis: string; replace?: boolean },
  ) {
    const row = this.db
      .prepare("SELECT body FROM applications WHERE id=?")
      .get(applicationId) as { body: string } | undefined;
    if (!row) throw new StoreError(404, "Application not found.");
    const existing = this.db
      .prepare("SELECT body,artifact FROM evidence WHERE application_id=?")
      .all(applicationId) as { body: string; artifact: string | null }[];
    const current = existing.find(
      (e) => JSON.parse(e.body).kind === "resume" && e.artifact,
    );
    if (current && !link.replace)
      throw new StoreError(409, "A resume file is already linked.");
    const data = readFileSync(link.path);
    if (data.length > 30 * 1024 * 1024)
      throw new Error("Evidence exceeds 30 MB.");
    if (data.subarray(0, 5).toString() !== "%PDF-")
      throw new Error("Invalid PDF signature");
    const sha = hash(data);
    const evidence = evidenceSchema.parse({
      id: `${applicationId}-resume-${sha.slice(0, 8)}`,
      label: link.label,
      kind: "resume",
      text: link.basis,
      basis: link.basis,
      sha256: sha,
      mediaType: "application/pdf",
    });
    const dest = join(this.dir, "artifacts", sha);
    if (!existsSync(dest)) {
      const tmp = `${dest}.${randomBytes(4).toString("hex")}.tmp`;
      writeFileSync(tmp, data, { mode: 0o600 });
      renameSync(tmp, dest);
    }
    const tx = transaction(this.db);
    try {
      if (current)
        this.db
          .prepare("DELETE FROM evidence WHERE id=?")
          .run(JSON.parse(current.body).id);
      this.db
        .prepare("INSERT INTO evidence VALUES (?,?,?,?)")
        .run(evidence.id, applicationId, JSON.stringify(evidence), sha);
      const generation = Number(this.meta("generation", "0")) + 1;
      this.db
        .prepare(
          "INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run("generation", String(generation));
      tx.commit();
      return { evidenceId: evidence.id, sha256: sha, generation };
    } catch (error) {
      tx.rollback();
      throw error;
    }
  }
  /** Record an employer's decision on a confirmed application: the message
      becomes feedback evidence, a decision event cites it, and the status
      changes. Rejected and closed are the only decisions an employer message
      can establish; offers go through the career workflow. */
  recordDecision(
    applicationId: string,
    decision: {
      status: "rejected" | "closed";
      date: string;
      label?: string;
      source: string;
      text: string;
      force?: boolean;
    },
  ) {
    const row = this.db
      .prepare("SELECT body FROM applications WHERE id=?")
      .get(applicationId) as { body: string } | undefined;
    if (!row) throw new StoreError(404, "Application not found.");
    const app = JSON.parse(row.body) as Application;
    if (
      (app.status === "rejected" || app.status === "closed") &&
      !decision.force
    )
      throw new StoreError(409, `Application is already ${app.status}.`);
    if (app.status === "offer" && !decision.force)
      throw new StoreError(
        409,
        "An offer is recorded; resolve it through the career workflow.",
      );
    const stamp = decision.date.replace(/-/g, "");
    const evidence = evidenceSchema.parse({
      id: `${applicationId}-decision-${stamp}`,
      label:
        decision.status === "rejected" ? "Employer declined" : "Role closed",
      kind: "feedback",
      text: decision.text,
      basis: decision.source,
    });
    const event = eventSchema.parse({
      id: `${applicationId}-decision-${stamp}-event`,
      stage: null,
      date: decision.date,
      label:
        decision.label ??
        (decision.status === "rejected"
          ? "Employer declined"
          : "Employer closed the role"),
      detail: `Recorded from the employer message dated ${decision.date}.`,
      evidenceIds: [evidence.id],
      kind: "decision",
    });
    const tx = transaction(this.db);
    try {
      this.db
        .prepare("INSERT INTO evidence VALUES (?,?,?,?)")
        .run(evidence.id, applicationId, JSON.stringify(evidence), null);
      this.db
        .prepare("INSERT INTO events VALUES (?,?,?)")
        .run(event.id, applicationId, JSON.stringify(event));
      const next = {
        ...app,
        status: decision.status,
        asOf: app.asOf > decision.date ? app.asOf : decision.date,
        events: [],
        evidence: [],
      };
      this.db
        .prepare("UPDATE applications SET body=? WHERE id=?")
        .run(JSON.stringify(next), applicationId);
      const generation = Number(this.meta("generation", "0")) + 1;
      this.db
        .prepare(
          "INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run("generation", String(generation));
      tx.commit();
      return { eventId: event.id, evidenceId: evidence.id, generation };
    } catch (error) {
      tx.rollback();
      throw error;
    }
  }
  artifact(id: string) {
    const row = this.db
      .prepare("SELECT body,artifact FROM evidence WHERE id=?")
      .get(id) as { body: string; artifact: string | null } | undefined;
    if (!row || !row.artifact)
      throw new StoreError(404, "No local file for this evidence.");
    const path = join(this.dir, "artifacts", row.artifact);
    if (!existsSync(path))
      throw new StoreError(404, "Evidence file is missing from disk.");
    const body = JSON.parse(row.body);
    if (hash(readFileSync(path)) !== row.artifact)
      throw new StoreError(409, "Evidence integrity check failed.");
    return { path, mediaType: body.mediaType ?? "text/plain", id };
  }
}
