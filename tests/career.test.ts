import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, hash } from "../server/store";
import { opportunitySchema } from "../shared/career";
import { demoManifest } from "../shared/demo";
const stores: Store[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) {
    s.close();
    rmSync(s.dir, { recursive: true, force: true });
  }
});
function setup() {
  const s = new Store(mkdtempSync(join(tmpdir(), "atlas-career-")));
  stores.push(s);
  let n = 0;
  const run = (action: string, payload: unknown) =>
    s.career.command({
      id: `c-${++n}`,
      expectedRevision: s.career.revision(),
      action,
      payload,
    });
  return { s, run };
}
function eligible() {
  const { s, run } = setup();
  run("families", {
    families: [
      {
        id: "engineering",
        name: "Engineering",
        rank: 1,
        evidence: ["User built a product"],
        rationale: "Implementation",
      },
    ],
  });
  run("opportunities", {
    opportunities: [
      opportunitySchema.parse({
        id: "o1",
        jobKey: "job-1",
        company: "Acme",
        companyKey: "acme",
        title: "Engineer",
        url: "",
        description: "Full job description",
        location: "Denver",
        roleFamilyId: "engineering",
        compensation: {
          currency: "USD",
          annualBase: 180000,
          annualCash: 180000,
        },
      }),
    ],
  });
  run("template", {
    template: {
      id: "t1",
      familyId: "engineering",
      version: 1,
      content: "Resume",
      claims: ["Built a product"],
    },
  });
  run("approve-template", {
    id: "t1",
    approvalNote: "User approved this exact version",
  });
  run("grant", {
    grant: {
      id: "g1",
      roleFamilyIds: ["engineering"],
      locations: ["Denver"],
      exclusions: [],
      minAnnualBase: 150000,
      currency: "USD",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      maxApplications: 2,
      approvedAt: new Date().toISOString(),
      approvalNote: "User approved this batch",
    },
  });
  return { s, run };
}
function prepare(
  run: ReturnType<typeof setup>["run"],
  s: Store,
  fence: number,
) {
  const bytes = "Exact resume bytes",
    h = hash(bytes);
  writeFileSync(join(s.dir, "artifacts", h), bytes);
  run("vet", {
    opportunityId: "o1",
    vetting: {
      verdict: "pass",
      checks: ["full posting read", "pay clears floor", "no duplicate"],
      by: "agent",
      at: new Date().toISOString(),
    },
  });
  run("prepare", {
    opportunityId: "o1",
    owner: "agent-a",
    fence,
    templateId: "t1",
    materialHashes: [h],
    answers: "Answers",
  });
}
it("keeps 2000 discovered roles separate from confirmed applications and persists them", () => {
  const { s, run } = setup();
  run("opportunities", {
    opportunities: Array.from({ length: 2000 }, (_, i) =>
      opportunitySchema.parse({
        id: `o-${i}`,
        jobKey: `job-${i}`,
        company: "Company",
        companyKey: "company",
        title: "Role",
        url: "",
        description: "",
        location: "Remote",
      }),
    ),
  });
  expect(s.snapshot().applications).toHaveLength(0);
  expect(s.snapshot().career.opportunities).toHaveLength(2000);
  const second = new Store(s.dir);
  expect(second.career.snapshot().opportunities).toHaveLength(2000);
  second.close();
});
it("crosswalks legacy confirmed records idempotently", () => {
  const { s } = setup();
  s.importManifest(demoManifest(), s.dir);
  expect(s.career.snapshot().opportunities).toHaveLength(14);
  expect(
    s.career
      .snapshot()
      .opportunities.every(
        (o) => o.lifecycle === "confirmed" && o.applicationId,
      ),
  ).toBe(true);
  s.importManifest(demoManifest(), s.dir);
  expect(s.career.snapshot().opportunities).toHaveLength(14);
});
it("serializes exclusive claims across database connections and fences expired workers", () => {
  const { s, run } = eligible();
  run("claim", { opportunityId: "o1", owner: "agent-a", grantId: "g1" });
  const second = new Store(s.dir);
  expect(() =>
    second.career.command({
      id: "other",
      expectedRevision: second.career.revision(),
      action: "claim",
      payload: { opportunityId: "o1", owner: "agent-b", grantId: "g1" },
    }),
  ).toThrow("already claimed");
  second.close();
  s.db
    .prepare("UPDATE application_claims SET expires_at=?")
    .run("2000-01-01T00:00:00.000Z");
  const r = run("claim", {
    opportunityId: "o1",
    owner: "agent-b",
    grantId: "g1",
  });
  expect(r.result.fence).toBe(2);
  expect(() =>
    run("release", { opportunityId: "o1", owner: "agent-a", fence: 1 }),
  ).toThrow("fencing");
});
it("rechecks revocation immediately before submission and rejects missing materials", () => {
  const { s, run } = eligible();
  run("claim", { opportunityId: "o1", owner: "agent-a", grantId: "g1" });
  expect(() =>
    run("prepare", {
      opportunityId: "o1",
      owner: "agent-a",
      fence: 1,
      templateId: "t1",
      materialHashes: ["a".repeat(64)],
      answers: "",
    }),
  ).toThrow("missing");
  prepare(run, s, 1);
  run("grant-state", { id: "g1", status: "revoked" });
  expect(() =>
    run("begin-submit", { opportunityId: "o1", owner: "agent-a", fence: 1 }),
  ).toThrow("inactive");
});
it("never retries uncertain or interrupted submissions without reconciliation", () => {
  const { s, run } = eligible();
  run("claim", { opportunityId: "o1", owner: "agent-a", grantId: "g1" });
  prepare(run, s, 1);
  run("begin-submit", { opportunityId: "o1", owner: "agent-a", fence: 1 });
  expect(() =>
    run("claim", { opportunityId: "o1", owner: "agent-b", grantId: "g1" }),
  ).toThrow("Reconcile");
  run("result", {
    opportunityId: "o1",
    owner: "agent-a",
    fence: 1,
    outcome: "uncertain",
    detail: "Browser disconnected after submit",
  });
  expect(() =>
    run("claim", { opportunityId: "o1", owner: "agent-b", grantId: "g1" }),
  ).toThrow("Reconcile");
  run("reconcile", {
    opportunityId: "o1",
    notSubmitted: true,
    evidence: "ATS explicitly confirms no application",
    source: "ATS receipt",
  });
  expect(
    run("claim", { opportunityId: "o1", owner: "agent-a", grantId: "g1" })
      .result.fence,
  ).toBe(2);
});
it("requires a receipt and atomically creates the confirmed projection", () => {
  const { s, run } = eligible();
  const app = demoManifest().applications[0];
  app.company = "Acme";
  app.title = "Engineer";
  app.evidence.push({
    id: "confirmed-receipt",
    kind: "receipt",
    label: "ATS receipt",
    text: "Application received",
    basis: "Employer confirmation",
  });
  app.events
    .find((e) => e.kind === "submission")!
    .evidenceIds.push("confirmed-receipt");
  const missing = { ...app, evidence: [] };
  expect(() =>
    run("confirm", { opportunityId: "o1", application: missing }),
  ).toThrow("receipt");
  run("confirm", { opportunityId: "o1", application: app });
  expect(s.snapshot().applications).toHaveLength(1);
  expect(s.career.snapshot().opportunities[0].applicationId).toBe(app.id);
  expect(() =>
    run("confirm", { opportunityId: "o1", application: app }),
  ).toThrow("already confirmed");
});
it("rejects stale revisions, conflicting idempotency keys, and more than twenty families", () => {
  const { s, run } = setup();
  const cmd = {
    id: "fixed",
    expectedRevision: s.career.revision(),
    action: "settings",
    payload: { settings: { goals: "New goal" } },
  };
  const first = s.career.command(cmd);
  expect(s.career.command(cmd)).toEqual(first);
  expect(() =>
    s.career.command({ ...cmd, payload: { settings: { goals: "Changed" } } }),
  ).toThrow("reused");
  expect(() => s.career.command({ ...cmd, id: "stale" })).toThrow("changed");
  expect(() =>
    run("families", {
      families: Array.from({ length: 21 }, (_, i) => ({
        id: `f${i}`,
        name: "Role",
        rank: 1,
        evidence: ["Evidence"],
        rationale: "",
      })),
    }),
  ).toThrow();
});
it("refuses unknown pay, duplicate jobs, and metadata overwrites of submission state", () => {
  const { s, run } = eligible();
  const original = s.career.snapshot().opportunities[0];
  expect(() =>
    run("opportunities", { opportunities: [{ ...original, id: "duplicate" }] }),
  ).toThrow();
  run("opportunities", {
    opportunities: [{ ...original, compensation: null }],
  });
  expect(() =>
    run("claim", { opportunityId: "o1", owner: "agent-a", grantId: "g1" }),
  ).toThrow("boundaries");
  expect(() =>
    run("opportunities", {
      opportunities: [
        {
          ...original,
          lifecycle: "confirmed",
          submittedAt: new Date().toISOString(),
        },
      ],
    }),
  ).toThrow("workflow");
});
it("revoked grants cannot regain permission through reconciliation or result reporting", () => {
  const { s, run } = eligible();
  run("claim", { opportunityId: "o1", owner: "agent-a", grantId: "g1" });
  prepare(run, s, 1);
  run("begin-submit", { opportunityId: "o1", owner: "agent-a", fence: 1 });
  run("grant-state", { id: "g1", status: "revoked" });
  run("result", {
    opportunityId: "o1",
    owner: "agent-a",
    fence: 1,
    outcome: "uncertain",
    detail: "No confirmation",
  });
  run("reconcile", {
    opportunityId: "o1",
    notSubmitted: true,
    evidence: "ATS says not submitted",
    source: "ATS",
  });
  expect(() =>
    run("claim", { opportunityId: "o1", owner: "agent-a", grantId: "g1" }),
  ).toThrow("inactive");
  expect(() => run("grant-state", { id: "g1", status: "active" })).toThrow(
    "permanently revoked",
  );
});
it("catches altered material bytes and keeps the record prepared", () => {
  const { s, run } = eligible();
  run("claim", { opportunityId: "o1", owner: "agent-a", grantId: "g1" });
  prepare(run, s, 1);
  const o = s.career.snapshot().opportunities[0];
  writeFileSync(join(s.dir, "artifacts", o.materialHashes[0]), "different");
  expect(() =>
    run("begin-submit", { opportunityId: "o1", owner: "agent-a", fence: 1 }),
  ).toThrow("hash mismatch");
  expect(s.career.snapshot().opportunities[0].lifecycle).toBe("prepared");
});
it("allows evidence-backed role annotations on confirmed data without rewriting submission history", () => {
  const { s, run } = eligible();
  s.importManifest(demoManifest(), s.dir);
  run("annotate", {
    opportunityId: "demo-1",
    roleFamilyId: "engineering",
    provenance: [
      {
        id: "mapping",
        kind: "user",
        text: "Role selected by user",
        source: "Conversation",
        recordedAt: new Date().toISOString(),
      },
    ],
  });
  const o = s.career.snapshot().opportunities.find((o) => o.id === "demo-1")!;
  expect(o.lifecycle).toBe("confirmed");
  expect(o.roleFamilyId).toBe("engineering");
  expect(() =>
    run("annotate", {
      opportunityId: o.id,
      provenance: [{ ...o.provenance[0], text: "Changed" }],
    }),
  ).toThrow("append-only");
});
it("keeps confirmed applications with unknown submission dates undated", () => {
  const { s } = setup();
  const m = demoManifest();
  m.applications[0].submitted = null;
  m.applications[0].events.find((e) => e.kind === "submission")!.date = null;
  s.importManifest(m, s.dir);
  expect(s.snapshot().applications[0].submitted).toBeNull();
  expect(
    s.career
      .snapshot()
      .opportunities.find((o) => o.id === m.applications[0].id)!.submittedAt,
  ).toBeNull();
});
it("reads 2000 confirmed records and their evidence in a bounded snapshot", () => {
  const { s } = setup();
  const m = demoManifest();
  const source = m.applications[0];
  m.applications = Array.from({ length: 2000 }, (_, i) => {
    const a = JSON.parse(JSON.stringify(source));
    const mapping = new Map<string, string>();
    for (const item of [a, ...a.events, ...a.evidence]) {
      mapping.set(item.id, `${item.id}-${i}`);
      item.id = `${item.id}-${i}`;
    }
    for (const e of a.events)
      e.evidenceIds = e.evidenceIds.map((id: string) => mapping.get(id));
    return a;
  });
  s.importManifest(m, s.dir);
  const start = performance.now();
  const snap = s.snapshot();
  expect(snap.applications).toHaveLength(2000);
  expect(snap.career.opportunities).toHaveLength(2000);
  expect(
    snap.applications.every((a) => a.events.length === source.events.length),
  ).toBe(true);
  expect(performance.now() - start).toBeLessThan(2000);
}, 15000);
it("rejects unsafe job links and normalized duplicates with tracking parameters", () => {
  const { run } = setup();
  const base = {
    id: "url-1",
    jobKey: "first",
    company: "Acme",
    companyKey: "acme",
    title: "Role",
    url: "https://jobs.example/role?utm_source=one",
    description: "",
    location: "",
  };
  run("opportunities", { opportunities: [opportunitySchema.parse(base)] });
  expect(() =>
    run("opportunities", {
      opportunities: [
        opportunitySchema.parse({
          ...base,
          id: "url-2",
          jobKey: "other",
          url: "https://jobs.example/role?utm_source=two",
        }),
      ],
    }),
  ).toThrow("already belongs");
  expect(() =>
    opportunitySchema.parse({ ...base, url: "javascript:alert(1)" }),
  ).toThrow();
});
it("imports uncertain history only with provenance and prevents blind retry", () => {
  const { s, run } = eligible();
  const original = s.career.snapshot().opportunities[0];
  const row = {
    ...original,
    id: "old",
    jobKey: "old-job",
    lifecycle: "uncertain",
    provenance: [],
  };
  expect(() => run("opportunities", { opportunities: [row] })).toThrow(
    "source provenance",
  );
  run("opportunities", {
    opportunities: [
      {
        ...row,
        provenance: [
          {
            id: "old-source",
            kind: "source",
            text: "Submission outcome was not captured",
            source: "Historical ledger",
            recordedAt: new Date().toISOString(),
          },
        ],
      },
    ],
  });
  expect(() =>
    run("claim", { opportunityId: "old", owner: "agent-a", grantId: "g1" }),
  ).toThrow("Reconcile");
});
it("renews an active lease without changing its fence and rejects expired or revoked ownership", () => {
  const { s, run } = eligible();
  run("claim", {
    opportunityId: "o1",
    owner: "agent-a",
    grantId: "g1",
    leaseSeconds: 30,
  });
  const renewed = run("renew", {
    opportunityId: "o1",
    owner: "agent-a",
    fence: 1,
    leaseSeconds: 900,
  });
  expect(renewed.result.fence).toBe(1);
  expect(Date.parse(renewed.result.expiresAt) - Date.now()).toBeGreaterThan(
    890000,
  );
  expect(() =>
    run("renew", { opportunityId: "o1", owner: "agent-b", fence: 1 }),
  ).toThrow("fencing");
  run("grant-state", { id: "g1", status: "paused" });
  expect(() =>
    run("renew", { opportunityId: "o1", owner: "agent-a", fence: 1 }),
  ).toThrow("inactive");
  run("grant-state", { id: "g1", status: "active" });
  s.db
    .prepare("UPDATE application_claims SET expires_at=?")
    .run("2000-01-01T00:00:00.000Z");
  expect(() =>
    run("renew", { opportunityId: "o1", owner: "agent-a", fence: 1 }),
  ).toThrow("expired");
});
it("persists role-family view filters alongside the selected city", () => {
  const { s } = eligible();
  s.command({
    id: "city",
    expectedRevision: 0,
    action: "location",
    payload: { city: "nyc" },
  });
  s.command({
    id: "role",
    expectedRevision: 1,
    action: "role",
    payload: { id: "engineering" },
  });
  expect(s.getView().roleFamilyId).toBe("engineering");
  expect(s.getView().city).toBe("nyc");
  expect(() =>
    s.command({
      id: "missing-role",
      expectedRevision: 2,
      action: "role",
      payload: { id: "missing" },
    }),
  ).toThrow("not found");
  const second = new Store(s.dir);
  expect(second.getView().roleFamilyId).toBe("engineering");
  second.close();
  s.command({
    id: "reset-role",
    expectedRevision: 2,
    action: "reset",
    payload: {},
  });
  expect(s.getView().roleFamilyId).toBeNull();
});
it("imports history atomically and preserves annotations on reruns", () => {
  const { s, run } = setup();
  const m = demoManifest(),
    base = {
      id: "history-only",
      company: "Historical",
      companyKey: "historical",
      title: "Role",
      jobKey: "history-job",
      url: "",
      description: "",
      location: "",
    };
  const first = s.importHistory(m, [base], s.dir);
  expect(first.opportunitiesAdded).toBe(1);
  run("annotate", {
    opportunityId: "history-only",
    provenance: [
      {
        id: "annotation",
        kind: "user",
        text: "Reviewed afterward",
        source: "Conversation",
        recordedAt: new Date().toISOString(),
      },
    ],
  });
  expect(s.importHistory(m, [base], s.dir).opportunitiesAdded).toBe(0);
  expect(
    s.career.snapshot().opportunities.find((o) => o.id === "history-only")
      ?.provenance,
  ).toHaveLength(1);
  const updated = structuredClone(m);
  updated.label = "Must not commit";
  const generation = s.snapshot().generation;
  expect(() =>
    s.importHistory(updated, [{ ...base, id: "conflict" }], s.dir),
  ).toThrow();
  expect(s.snapshot().label).toBe(m.label);
  expect(s.snapshot().generation).toBe(generation);
  expect(s.career.snapshot().opportunities).toHaveLength(15);
});
it("rechecks the approved template family after classification changes", () => {
  const { s, run } = eligible();
  const original = s.career.snapshot();
  run("families", {
    families: [
      ...original.families,
      {
        id: "consulting",
        name: "Consulting",
        rank: 2,
        evidence: ["Customer implementation"],
        rationale: "Customer work",
      },
    ],
  });
  run("grant", {
    grant: {
      ...original.grants[0],
      id: "wide-grant",
      roleFamilyIds: ["engineering", "consulting"],
    },
  });
  run("claim", {
    opportunityId: "o1",
    owner: "agent-a",
    grantId: "wide-grant",
  });
  prepare(run, s, 1);
  run("annotate", {
    opportunityId: "o1",
    roleFamilyId: "consulting",
    provenance: [],
  });
  expect(() =>
    run("begin-submit", { opportunityId: "o1", owner: "agent-a", fence: 1 }),
  ).toThrow("approved template");
});

it("approves sorted roles by default, and only the user's hold or skip stops them", () => {
  const { s, run } = setup();
  const role = opportunitySchema.parse({
    id: "opp-queue",
    company: "Acme",
    companyKey: "acme",
    title: "Forward Deployed Engineer",
    jobKey: "acme|fde",
    url: "https://jobs.example.com/acme/fde",
    description: "Strong fit.",
    location: "New York, NY",
  });
  run("opportunities", { opportunities: [role] });
  const decidedAt = new Date().toISOString();
  const at = (id: string) =>
    s.career.snapshot().opportunities.find((x) => x.id === id)!;
  run("triage", {
    opportunityId: role.id,
    triage: {
      tier: "top",
      score: 91,
      reason: "Title and pay match.",
      decidedAt,
    },
  });
  expect(at(role.id).triage).toMatchObject({
    tier: "top",
    decision: "approved",
    decidedBy: "agent",
  });
  expect(() =>
    run("triage", {
      opportunityId: role.id,
      triage: { tier: "top", reason: "", decidedAt, decision: "hold" },
    }),
  ).toThrow();
  run("decide", {
    opportunityId: role.id,
    decision: "hold",
    note: "I want to read this one.",
  });
  expect(at(role.id).triage).toMatchObject({
    decision: "hold",
    decidedBy: "user",
  });
  expect(at(role.id).provenance.at(-1)).toMatchObject({
    kind: "user",
    source: "queue",
  });
  run("triage", {
    opportunityId: role.id,
    triage: { tier: "standard", reason: "re-sorted", decidedAt },
  });
  expect(at(role.id).triage).toMatchObject({
    tier: "standard",
    decision: "hold",
    decidedBy: "user",
  });
  run("decide", { opportunityId: role.id, decision: "approved" });
  expect(at(role.id).triage!.decision).toBe("approved");
  run("triage", {
    opportunityId: role.id,
    triage: { tier: "skip", reason: "below floor", decidedAt },
  });
  expect(at(role.id).triage!.decision).toBe("approved");
  expect(() =>
    run("decide", { opportunityId: "missing", decision: "skipped" }),
  ).toThrow();
});
it("refuses to begin a submission until the role is vetted with a pass", () => {
  const { s, run } = eligible();
  run("claim", { opportunityId: "o1", owner: "agent-a", grantId: "g1" });
  const bytes = "Exact resume bytes",
    h = hash(bytes);
  writeFileSync(join(s.dir, "artifacts", h), bytes);
  run("prepare", {
    opportunityId: "o1",
    owner: "agent-a",
    fence: 1,
    templateId: "t1",
    materialHashes: [h],
    answers: "Answers",
  });
  expect(() =>
    run("begin-submit", { opportunityId: "o1", owner: "agent-a", fence: 1 }),
  ).toThrow(/Vet the role/);
  run("vet", {
    opportunityId: "o1",
    vetting: {
      verdict: "fail",
      checks: ["pay below floor"],
      note: "Posting lists $120K.",
      by: "agent",
      at: new Date().toISOString(),
    },
  });
  expect(() =>
    run("begin-submit", { opportunityId: "o1", owner: "agent-a", fence: 1 }),
  ).toThrow(/Vet the role/);
  run("vet", {
    opportunityId: "o1",
    vetting: {
      verdict: "pass",
      checks: ["full posting read", "pay clears floor"],
      by: "user",
      at: new Date().toISOString(),
    },
  });
  run("begin-submit", { opportunityId: "o1", owner: "agent-a", fence: 1 });
  expect(s.career.snapshot().opportunities[0].lifecycle).toBe("attempted");
  expect(() =>
    run("vet", {
      opportunityId: "o1",
      vetting: {
        verdict: "pass",
        checks: ["x"],
        by: "agent",
        at: new Date().toISOString(),
      },
    }),
  ).not.toThrow();
});

it("migrates the earlier review/auto triage into top/standard with approved decisions", () => {
  const { s } = setup();
  const old = (id: string, tier: string, decision: string) =>
    JSON.stringify({
      id,
      company: "Old Co",
      companyKey: "oldco",
      title: id,
      jobKey: `old|${id}`,
      url: "",
      description: "",
      roleFamilyId: null,
      location: "",
      workArrangement: "unknown",
      compensation: null,
      lifecycle: "discovered",
      submittedAt: null,
      applicationId: null,
      offer: null,
      provenance: [],
      triage: {
        tier,
        score: null,
        reason: "",
        decidedBy: "agent",
        decidedAt: new Date().toISOString(),
        decision,
      },
      templateId: null,
      materialHashes: [],
      answers: "",
    });
  s.db
    .prepare("INSERT INTO opportunities VALUES (?,?,?)")
    .run("m1", "old|m1", old("m1", "review", "pending"));
  s.db
    .prepare("INSERT INTO opportunities VALUES (?,?,?)")
    .run("m2", "old|m2", old("m2", "auto", "approved"));
  s.db
    .prepare("INSERT INTO opportunities VALUES (?,?,?)")
    .run("m3", "old|m3", old("m3", "skip", "skipped"));
  s.db.exec("PRAGMA user_version=3");
  const reopened = new Store(s.dir);
  const byId = new Map(
    reopened.career.snapshot().opportunities.map((o) => [o.id, o.triage]),
  );
  reopened.close();
  expect(byId.get("m1")).toMatchObject({ tier: "top", decision: "approved" });
  expect(byId.get("m2")).toMatchObject({
    tier: "standard",
    decision: "approved",
  });
  expect(byId.get("m3")).toMatchObject({ tier: "skip", decision: "skipped" });
});
it("an employer's application limit blocks claims until the window reopens", () => {
  const { s, run } = eligible();
  const day = 86_400_000,
    ago = (days: number) =>
      new Date(Date.now() - days * day).toISOString().slice(0, 10);
  const history = (entries: [string, string][]) => {
    const manifest = demoManifest();
    const template = manifest.applications[0];
    manifest.label = `acme-${entries.map(([id]) => id).join("-")}`;
    manifest.applications = entries.map(([id, submitted]) => ({
      ...template,
      id: `app-${id}`,
      company: "ACME",
      title: `Role ${id}`,
      submitted,
      events: template.events.map((e) => ({
        ...e,
        id: `${id}-${e.id}`,
        date: e.kind === "submission" ? submitted : e.date,
        evidenceIds: e.evidenceIds.map((x) => `${id}-${x}`),
      })),
      evidence: template.evidence.map((e) => ({ ...e, id: `${id}-${e.id}` })),
    }));
    s.importManifest(manifest, s.dir);
  };
  history([
    ["old", ago(100)],
    ["recent", ago(10)],
  ]);
  const standing = run("company-policy", {
    policy: {
      company: "Acme",
      companyKey: "ignored-and-normalized",
      maxApplications: 2,
      windowDays: 90,
      source: "Careers FAQ: two applications per rolling 90 days",
      recordedAt: new Date().toISOString(),
    },
  }).result;
  expect(standing).toMatchObject({ used: 1, max: 2, atCap: false });
  expect(s.career.snapshot().companyPolicies[0].companyKey).toBe("acme");
  run("claim", { opportunityId: "o1", owner: "agent-a", grantId: "g1" });
  run("release", { opportunityId: "o1", owner: "agent-a", fence: 1 });
  history([
    ["old", ago(100)],
    ["recent", ago(10)],
    ["newest", ago(3)],
  ]);
  expect(() =>
    run("claim", { opportunityId: "o1", owner: "agent-a", grantId: "g1" }),
  ).toThrow(/Company limit reached: 2 of 2.*Next eligible/);
  // An undated attempt counts, and hides the reopening date until reconciled.
  run("company-policy", {
    policy: {
      company: "Acme",
      companyKey: "acme",
      maxApplications: 3,
      windowDays: 90,
      source: "Corrected after re-reading the FAQ",
      recordedAt: new Date().toISOString(),
    },
  });
  run("opportunities", {
    opportunities: [
      opportunitySchema.parse({
        id: "acme-uncertain",
        jobKey: "acme-uncertain",
        company: "Acme",
        companyKey: "acme",
        title: "Role uncertain",
        url: "",
        description: "d",
        location: "Denver",
        lifecycle: "uncertain",
        provenance: [
          {
            id: "acme-uncertain-source",
            kind: "source",
            text: "Browser closed mid-submit",
            source: "ledger",
            recordedAt: new Date().toISOString(),
          },
        ],
      }),
    ],
  });
  expect(() =>
    run("claim", { opportunityId: "o1", owner: "agent-a", grantId: "g1" }),
  ).toThrow(/3 of 3.*Reconcile undated attempts/);
  run("company-policy", { companyKey: "acme", remove: true });
  expect(s.career.snapshot().companyPolicies).toEqual([]);
  run("claim", { opportunityId: "o1", owner: "agent-a", grantId: "g1" });
});
