import { applicationScene } from "../shared/locations";
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
    if (version > 2) {
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
    this.db
      .prepare("INSERT OR IGNORE INTO view_state VALUES (1,?)")
      .run(JSON.stringify(initialView));
    chmodSync(join(dir, "career.sqlite"), 0o600);
  }
  close() {
    this.db.close();
  }
  getView(): View {
    return {
      ...initialView,
      ...JSON.parse(
        (
          this.db.prepare("SELECT body FROM view_state WHERE id=1").get() as {
            body: string;
          }
        ).body,
      ),
    };
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
    for (const a of apps) {
      a.events = (
        this.db
          .prepare(
            "SELECT body FROM events WHERE application_id=? ORDER BY rowid",
          )
          .all(a.id) as { body: string }[]
      ).map((r) => JSON.parse(r.body));
      a.evidence = (
        this.db
          .prepare(
            "SELECT body,artifact FROM evidence WHERE application_id=? ORDER BY rowid",
          )
          .all(a.id) as { body: string; artifact: string | null }[]
      ).map((r) => ({
        ...JSON.parse(r.body),
        file: r.artifact
          ? `/api/evidence/${JSON.parse(r.body).id}/file`
          : undefined,
      }));
    }
    return {
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
    this.db.exec("BEGIN IMMEDIATE");
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
      this.db.exec("COMMIT");
      return { changed: true, generation };
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  command(raw: unknown) {
    const c = commandSchema.parse(raw);
    this.db.exec("BEGIN IMMEDIATE");
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
        this.db.exec("COMMIT");
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
      this.db.exec("COMMIT");
      return response;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  private apply(view: View, c: Command) {
    const p = c.payload;
    switch (c.action) {
      case "location": {
        const { city } = z
          .object({ city: themeSchema.nullable() })
          .strict()
          .parse(p);
        view.city = city;
        view.theme = city ?? "neutral";
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
