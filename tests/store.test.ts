import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, hash } from "../server/store";
import { demoManifest } from "../shared/demo";
import { journeys } from "../src/journey";
const resources: { dir: string; store: Store }[] = [];
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "career-flow-test-")),
    store = new Store(dir);
  resources.push({ dir, store });
  return { dir, store };
}
afterEach(() => {
  for (const r of resources.splice(0)) {
    try {
      r.store.close();
    } catch {}
    rmSync(r.dir, { recursive: true, force: true });
  }
});
describe("disk data and controls", () => {
  it("imports once, preserves counts and survives a new connection", () => {
    const { dir, store } = setup(),
      m = demoManifest();
    expect(store.importManifest(m, dir).changed).toBe(true);
    expect(store.importManifest(m, dir).changed).toBe(false);
    expect(store.snapshot().applications).toHaveLength(14);
    store.command({
      id: "one",
      expectedRevision: 0,
      action: "select",
      payload: { id: "demo-1" },
    });
    const next = new Store(dir);
    expect(next.getView().selectedId).toBe("demo-1");
    expect(next.snapshot().applications).toHaveLength(14);
    next.close();
  });
  it("does not mix private and public demo datasets", () => {
    const { dir, store } = setup(),
      m = demoManifest();
    store.importManifest(m, dir);
    expect(() => store.importManifest({ ...m, mode: "private" }, dir)).toThrow(
      "separate directories",
    );
    expect(store.snapshot().mode).toBe("demo");
  });
  it("rejects changed ID reuse and stale revisions; identical retries are idempotent", () => {
    const { store } = setup();
    const c = {
      id: "cmd",
      expectedRevision: 0,
      action: "theme",
      payload: { theme: "nyc" },
    };
    const a = store.command(c);
    expect(store.command(c)).toEqual(a);
    expect(() => store.command({ ...c, payload: { theme: "remote" } })).toThrow(
      "different arguments",
    );
    expect(() => store.command({ ...c, id: "new" })).toThrow("view changed");
    expect(store.getView().revision).toBe(1);
  });
  it("validates commands without changing saved state", () => {
    const { store } = setup();
    expect(() =>
      store.command({
        id: "bad",
        expectedRevision: 0,
        action: "motion",
        payload: { enabled: "yes" },
      }),
    ).toThrow();
    expect(() =>
      store.command({
        id: "bad",
        expectedRevision: 0,
        action: "select",
        payload: { id: "missing" },
      }),
    ).toThrow("not found");
    expect(store.getView().revision).toBe(0);
  });
  it("rejects bad hashes and missing evidence references without partial database writes", () => {
    const { dir, store } = setup(),
      m = demoManifest();
    writeFileSync(join(dir, "proof.txt"), "proof");
    m.applications[0].evidence[0] = {
      ...m.applications[0].evidence[0],
      file: "proof.txt",
      sha256: "0".repeat(64),
    };
    expect(() => store.importManifest(m, dir)).toThrow("hash mismatch");
    expect(store.snapshot().applications).toHaveLength(0);
    m.applications[0].evidence[0].sha256 = hash("proof");
    m.applications[1].events[0].evidenceIds = ["missing"];
    expect(() => store.importManifest(m, dir)).toThrow("Missing evidence");
    expect(store.snapshot().generation).toBe(0);
  });
  it("copies evidence to managed storage and detects tampering", () => {
    const { dir, store } = setup(),
      m = demoManifest();
    writeFileSync(join(dir, "proof.txt"), "proof");
    m.applications[0].evidence[0] = {
      ...m.applications[0].evidence[0],
      file: "proof.txt",
      mediaType: "text/plain",
      sha256: hash("proof"),
    };
    store.importManifest(m, dir);
    const artifact = store.artifact("demo-0-source");
    expect(readFileSync(artifact.path, "utf8")).toBe("proof");
    expect(store.snapshot().applications[0].evidence[0].file).toMatch(
      /^\/api\/evidence/,
    );
    rmSync(join(dir, "proof.txt"));
    expect(store.artifact("demo-0-source").path).toBe(artifact.path);
    writeFileSync(artifact.path, "tampered");
    expect(() => store.artifact("demo-0-source")).toThrow("integrity");
  });
  it("rolls back an import with a cross-application event collision", () => {
    const { dir, store } = setup(),
      m = demoManifest();
    store.importManifest(m, dir);
    const updated = demoManifest();
    updated.applications = updated.applications.slice(0, 1);
    updated.applications[0].events[0].id = "demo-1-event-0";
    expect(() => store.importManifest(updated, dir)).toThrow();
    expect(store.snapshot().generation).toBe(1);
    expect(store.snapshot().applications[0].events[0].id).toBe(
      "demo-0-event-0",
    );
  });
  it("always follows application location despite legacy lock arguments and preserves motion on reset", () => {
    const { dir, store } = setup();
    store.importManifest(demoManifest(), dir);
    store.command({
      id: "1",
      expectedRevision: 0,
      action: "theme",
      payload: { theme: "denver", locked: true },
    });
    store.command({
      id: "2",
      expectedRevision: 1,
      action: "select",
      payload: { id: "demo-0" },
    });
    expect(store.getView().theme).toBe("nyc");
    expect(store.getView().themeLocked).toBe(false);
    store.command({
      id: "3",
      expectedRevision: 2,
      action: "motion",
      payload: { enabled: false },
    });
    store.command({
      id: "4",
      expectedRevision: 3,
      action: "reset",
      payload: {},
    });
    expect(store.getView().motion).toBe(false);
    expect(store.getView().theme).toBe("neutral");
  });
});
describe("journey truth", () => {
  it("renders exactly one finite path and endpoint per application", () => {
    const apps = demoManifest().applications,
      paths = journeys(apps);
    expect(paths.map((p) => p.id).sort()).toEqual(apps.map((a) => a.id).sort());
    for (const p of paths) {
      expect(p.path).not.toMatch(/NaN|Infinity/);
      expect(Number.isFinite(p.end.x) && Number.isFinite(p.end.y)).toBe(true);
    }
  });
  it("does not invent intermediate stages and handles empty filters", () => {
    const a = demoManifest().applications[0];
    a.events = a.events.filter(
      (e) => e.stage === "applied" || e.stage === "case",
    );
    const [path] = journeys([a]);
    expect(path.stages).toEqual(["applied", "case"]);
    expect(path.uncertain).toBe(true);
    expect(journeys([])).toEqual([]);
  });
});
