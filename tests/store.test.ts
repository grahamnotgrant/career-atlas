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

it("keeps a stage selection in the view and clears it when the place changes", () => {
  const dir = mkdtempSync(join(tmpdir(), "career-flow-selection-"));
  const store = new Store(dir);
  try {
    store.importManifest(demoManifest(), "demo");
    const select = (selection: unknown, expectedRevision: number) =>
      store.command({
        id: `sel-${expectedRevision}`,
        expectedRevision,
        action: "selection",
        payload: { selection },
      });
    let view = select(
      { kind: "stage", id: "recruiter" },
      store.snapshot().view.revision,
    ).view;
    expect(view.selection).toEqual({ kind: "stage", id: "recruiter" });
    expect(() =>
      select({ kind: "stage", id: "nowhere" }, view.revision),
    ).toThrow();
    view = store.command({
      id: "loc",
      expectedRevision: view.revision,
      action: "location",
      payload: { city: "nyc" },
    }).view;
    expect(view.selection).toBeNull();
    view = select({ kind: "outcome", id: "rejected" }, view.revision).view;
    expect(new Store(dir).snapshot().view.selection).toEqual({
      kind: "outcome",
      id: "rejected",
    });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("attaches a resume by hash with its label, refuses a second without replace, and serves the file", () => {
  const { dir, store } = setup();
  store.importManifest(demoManifest(), dir);
  const pdf = join(dir, "sent.pdf");
  writeFileSync(pdf, "%PDF-1.4\n%resume bytes\n");
  const attached = store.attachResume("demo-1", {
    path: pdf,
    label: "Resume named in the record; bytes not verified",
    basis: "Record names sent.pdf; no hash recorded.",
  });
  expect(attached.sha256).toBe(hash(readFileSync(pdf)));
  const app = store.snapshot().applications.find((a) => a.id === "demo-1")!;
  const resume = app.evidence.find((e) => e.kind === "resume")!;
  expect(resume.label).toMatch(/not verified/);
  expect(resume.file).toBe(`/api/evidence/${resume.id}/file`);
  expect(store.artifact(resume.id).path).toBe(
    join(dir, "artifacts", attached.sha256),
  );
  expect(() =>
    store.attachResume("demo-1", { path: pdf, label: "x", basis: "y" }),
  ).toThrow(/already linked/);
  writeFileSync(pdf, "not a pdf");
  expect(() =>
    store.attachResume("demo-2", { path: pdf, label: "x", basis: "y" }),
  ).toThrow(/PDF/);
  expect(() =>
    store.attachResume("nope", { path: pdf, label: "x", basis: "y" }),
  ).toThrow(/not found/);
});

it("records an employer decision as cited evidence and refuses to decide twice", () => {
  const { dir, store } = setup();
  store.importManifest(demoManifest(), dir);
  const pending = store
    .snapshot()
    .applications.find((a) => a.status === "pending")!;
  const result = store.recordDecision(pending.id, {
    status: "rejected",
    date: "2026-09-10",
    source: "mail:thread/abc",
    text: "After careful consideration we will not be moving forward.",
  });
  const app = store.snapshot().applications.find((a) => a.id === pending.id)!;
  expect(app.status).toBe("rejected");
  const event = app.events.find((e) => e.id === result.eventId)!;
  expect(event).toMatchObject({
    kind: "decision",
    date: "2026-09-10",
    stage: null,
  });
  const evidence = app.evidence.find((e) => e.id === result.evidenceId)!;
  expect(evidence).toMatchObject({
    kind: "feedback",
    basis: "mail:thread/abc",
  });
  expect(event.evidenceIds).toContain(evidence.id);
  expect(() =>
    store.recordDecision(pending.id, {
      status: "closed",
      date: "2026-09-11",
      source: "x",
      text: "y",
    }),
  ).toThrow(/already rejected/);
  expect(() =>
    store.recordDecision("missing", {
      status: "closed",
      date: "2026-09-11",
      source: "x",
      text: "y",
    }),
  ).toThrow(/not found/);
});

it("lets only the user close silent applications, and only after 30 days", () => {
  const { dir, store } = setup();
  const m = demoManifest();
  const old = m.applications.find((a) => a.status === "pending")!;
  old.submitted = "2026-06-01";
  for (const e of old.events) if (e.date) e.date = "2026-06-01";
  const fresh = m.applications.find(
    (a) => a.status === "pending" && a.id !== old.id,
  )!;
  store.importManifest(m, dir);
  const revision = store.snapshot().view.revision;
  expect(() =>
    store.command({
      id: "cs-1",
      expectedRevision: revision,
      action: "close-silent",
      payload: { ids: [fresh.id] },
    }),
  ).toThrow(/not been silent/);
  store.command({
    id: "cs-2",
    expectedRevision: revision,
    action: "close-silent",
    payload: { ids: [old.id] },
  });
  const closed = store.snapshot().applications.find((a) => a.id === old.id)!;
  expect(closed.status).toBe("closed");
  const decision = closed.events.at(-1)!;
  expect(decision.kind).toBe("decision");
  expect(decision.label).toMatch(/Closed by you/);
  expect(closed.evidence.at(-1)!.basis).toBe("user");
});
