import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, hash } from "../server/store";
import { demoManifest } from "../shared/demo";
import { backupData, restoreData } from "../server/operations";
import { createApp } from "../server/app";
const stores: Store[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) {
    s.close();
    rmSync(s.dir, { recursive: true, force: true });
  }
});
function setup() {
  const s = new Store(mkdtempSync(join(tmpdir(), "atlas-workspace-")));
  stores.push(s);
  let n = 0;
  const run = (
    action: string,
    payload: unknown,
    actor = "agent-one",
    channel = "agent",
  ) =>
    s.workspace.command({
      id: `w-${++n}`,
      expectedRevision: s.workspace.revision(),
      actor,
      channel,
      action,
      payload,
    });
  return { s, run };
}
it("persists a run and its exact question across a restart, with idempotent answer and stale-write protection", () => {
  const { s, run } = setup();
  run("run", {
    run: {
      id: "daily",
      operation: "daily-flow",
      label: "Daily search",
      owner: "agent-one",
      phase: "Evidence",
      status: "waiting",
      nextAction: "Answer the evidence question",
    },
  });
  run("question", {
    question: {
      id: "ownership",
      prompt: "Which portfolio decision did you make?",
      runId: "daily",
      support: [{ label: "Design review", reference: "portfolio/review" }],
    },
  });
  const command = {
    id: "exact-answer",
    expectedRevision: s.workspace.revision(),
    actor: "person",
    channel: "app",
    action: "answer",
    payload: {
      id: "ownership",
      answer: "I chose the layout after comparing two options.",
    },
  };
  const result = s.workspace.command(command);
  expect(s.workspace.command(command)).toEqual(result);
  expect(() =>
    s.workspace.command({
      ...command,
      id: "stale",
      payload: { id: "ownership", answer: "Replace" },
    }),
  ).toThrow(/changed/i);
  const state = s.workspace.snapshot();
  expect(state.questions[0]).toMatchObject({
    status: "answered",
    answer: "I chose the layout after comparing two options.",
    answeredBy: "person",
  });
  expect(state.runs[0].owner).toBe("agent-one");
  const reopened = new Store(s.dir);
  try {
    expect(reopened.workspace.snapshot().questions).toEqual(state.questions);
  } finally {
    reopened.close();
  }
});
it("keeps last successful source coverage when a later source fails", () => {
  const { s, run } = setup();
  const source = {
    id: "portfolio",
    label: "Portfolio",
    kind: "files",
    scope: "Selected portfolio folder",
    authorizationRef: "User selected the folder",
    coverage: "complete",
    checkedAt: "2026-10-26T18:00:00.000Z",
    checkedThrough: "2026-10-26T17:00:00.000Z",
    cursor: "page-2",
  };
  run("source", { source });
  run("source", {
    source: {
      ...source,
      coverage: "unavailable",
      checkedAt: "2026-10-27T18:00:00.000Z",
      checkedThrough: null,
      cursor: null,
      message: "Folder unavailable",
      recoveryAction: "Reconnect selected folder",
    },
  });
  expect(s.workspace.snapshot().sources[0]).toMatchObject({
    coverage: "unavailable",
    lastSuccessful: {
      checkedAt: "2026-10-26T18:00:00.000Z",
      checkedThrough: "2026-10-26T17:00:00.000Z",
      cursor: "page-2",
    },
  });
});
it("keeps an app instruction pending until its owning agent acknowledges it without expanding career authority", () => {
  const { s, run } = setup(),
    before = s.career.snapshot();
  run("run", {
    run: {
      id: "daily",
      operation: "daily-flow",
      label: "Daily search",
      owner: "agent-one",
      phase: "Scout",
      status: "running",
    },
  });
  const instruction = run(
    "steer",
    { instruction: "Focus on design studios", runId: "daily" },
    "person",
    "app",
  ).result;
  expect(s.workspace.snapshot().steering[0].status).toBe("pending");
  expect(() =>
    run(
      "steering-state",
      { id: instruction.id, status: "acknowledged" },
      "agent-two",
    ),
  ).toThrow(/another agent/i);
  expect(() =>
    run("steering-state", { id: instruction.id, status: "completed" }),
  ).toThrow(/acknowledge/i);
  run("steering-state", {
    id: instruction.id,
    status: "acknowledged",
    message: "Will re-screen the queue",
  });
  run("steering-state", {
    id: instruction.id,
    status: "completed",
    message: "Queue re-screened",
  });
  expect(s.workspace.snapshot().steering[0]).toMatchObject({
    status: "completed",
    owner: "agent-one",
  });
  expect(s.career.snapshot()).toEqual(before);
});
it("requires exact supported wording approval and invalidates approval when its facts change", () => {
  const { s, run } = setup();
  const fact = {
    id: "layout",
    label: "Portfolio layout",
    observation: "Compared two room layouts",
    contribution: "Chose the final layout",
    ownership: "user-reported",
    outcome: "used",
    wording: "Selected a room layout after comparing two options.",
    support: [{ label: "Review", reference: "portfolio/review" }],
  };
  run("fact", { fact });
  expect(() =>
    run(
      "approve-fact",
      { id: "layout", wording: "Built a deployed app" },
      "person",
      "app",
    ),
  ).toThrow(/exact/i);
  run("approve-fact", { id: "layout", wording: fact.wording }, "person", "app");
  expect(s.workspace.snapshot().facts[0].wordingApproval?.text).toBe(
    fact.wording,
  );
  run("fact", {
    fact: {
      ...fact,
      contribution: "Ownership is unclear",
      ownership: "unresolved",
    },
  });
  expect(s.workspace.snapshot().facts[0].wordingApproval).toBeNull();
  expect(() =>
    run(
      "approve-fact",
      { id: "layout", wording: fact.wording },
      "person",
      "app",
    ),
  ).toThrow(/contribution/i);
});
it("preserves completed legacy phases and answers when importing a session without modifying the source", () => {
  const { s, run } = setup();
  const session = {
    sessionId: "legacy-daily",
    skill: "daily-flow",
    status: "waiting_for_user",
    completed: ["Synced employer events"],
    phases: [
      {
        name: "sync",
        status: "complete",
        outputs: ["app-1"],
        checkedRevision: 23,
      },
    ],
    openQuestions: [
      {
        id: "q",
        question: "Which layout did you choose?",
        status: "resolved",
        answer: "The second",
      },
    ],
    nextAction: "Review new evidence",
    customHistory: { older: ["Original review"] },
  };
  const untouched = structuredClone(session);
  run("import-session", { session });
  expect(s.workspace.snapshot().runs[0]).toMatchObject({
    status: "waiting",
    legacySession: session,
  });
  expect(s.workspace.snapshot().questions[0]).toMatchObject({
    status: "answered",
    answer: "The second",
  });
  run("import-session", { session });
  expect(s.workspace.snapshot().runs).toHaveLength(1);
  expect(session).toEqual(untouched);
});
it("refuses material associations to missing application identities and preserves exact original/derivative files", () => {
  const { s, run } = setup();
  const material = {
    id: "portfolio",
    applicationId: "missing",
    attemptKey: "attempt-one",
    label: "Portfolio PDF",
    role: "portfolio",
    mediaType: "application/pdf",
    sha256: "a".repeat(64),
    reference: "artifacts/portfolio.pdf",
    coverage: "verified",
    questions: [
      {
        prompt: "Why this studio?",
        answer: "Their residential projects match my portfolio.",
        status: "answered",
      },
    ],
  };
  expect(() => run("material", { material })).toThrow(
    /application.*not found/i,
  );
});
it("preserves application-specific material bytes and answers and refuses cross-attempt derivatives", () => {
  const { s, run } = setup(),
    manifest = demoManifest();
  s.importManifest(manifest, s.dir);
  const app = manifest.applications[0];
  const bytes = "Exact portfolio PDF bytes",
    sha256 = hash(bytes);
  writeFileSync(join(s.dir, "artifacts", sha256), bytes);
  const material = {
    id: "portfolio-original",
    applicationId: app.id,
    attemptKey: "attempt-one",
    label: "Portfolio PDF",
    role: "portfolio",
    mediaType: "application/pdf",
    sha256,
    reference: `artifacts/${sha256}`,
    coverage: "verified",
    questions: [
      {
        prompt: "Why this studio?",
        answer: "Their residential projects match my portfolio.",
        status: "answered",
      },
    ],
  };
  run("material", { material });
  run("material", {
    material: {
      ...material,
      id: "portfolio-preview",
      originalId: material.id,
      mediaType: "image/png",
    },
  });
  expect(s.workspace.snapshot().materials[0].questions).toEqual(
    material.questions,
  );
  expect(() =>
    run("material", {
      material: {
        ...material,
        id: "wrong-attempt",
        attemptKey: "attempt-two",
        originalId: material.id,
      },
    }),
  ).toThrow(/same application attempt/i);
  expect(() =>
    run("material", { material: { ...material, label: "Replace original" } }),
  ).toThrow(/immutable/i);
  writeFileSync(join(s.dir, "artifacts", sha256), "Tampered");
  expect(() =>
    run("material", { material: { ...material, id: "tampered" } }),
  ).toThrow(/hash mismatch/i);
});
it("migrates an existing workspace with a backup and preserves its career and view state", () => {
  const { s } = setup();
  s.command({
    id: "motion-off",
    expectedRevision: 0,
    action: "motion",
    payload: { enabled: false },
  });
  const career = s.career.snapshot(),
    view = s.getView();
  s.db.exec(
    "DROP TABLE workspace_state; DROP TABLE workspace_commands; DROP TABLE workspace_audit; PRAGMA user_version=4;",
  );
  const reopened = new Store(s.dir);
  try {
    expect(reopened.workspace.snapshot().runs).toEqual([]);
    expect(reopened.career.snapshot()).toEqual(career);
    expect(reopened.getView()).toEqual(view);
    expect(
      readdirSync(join(s.dir, "backups")).some((x) =>
        x.startsWith("before-v5-"),
      ),
    ).toBe(true);
  } finally {
    reopened.close();
  }
});
it("includes durable work and command receipts in backup and restore", () => {
  const { s, run } = setup(),
    backup = s.dir + "-backup",
    restored = s.dir + "-restore";
  const command = {
    id: "portable-run",
    expectedRevision: 0,
    actor: "agent-one",
    channel: "agent",
    action: "run",
    payload: {
      run: {
        id: "portfolio",
        operation: "evidence",
        label: "Portfolio review",
        owner: "agent-one",
        status: "running",
      },
    },
  };
  const response = s.workspace.command(command);
  try {
    backupData(s.dir, backup);
    restoreData(backup, restored);
    const copy = new Store(restored);
    try {
      expect(copy.workspace.snapshot().runs[0].id).toBe("portfolio");
      expect(copy.workspace.command(command)).toEqual(response);
    } finally {
      copy.close();
    }
  } finally {
    rmSync(backup, { recursive: true, force: true });
    rmSync(restored, { recursive: true, force: true });
  }
});
it("protects workspace API reads/writes and reports conflicts without changing records", async () => {
  const { s } = setup(),
    app = await createApp(s);
  try {
    expect((await app.inject("/api/workspace")).statusCode).toBe(401);
    expect((await app.inject("/api/workspace/capabilities")).statusCode).toBe(
      401,
    );
    const headers = { authorization: `Bearer ${s.token}` };
    expect(
      (
        await app.inject({ url: "/api/workspace/capabilities", headers })
      ).json(),
    ).toMatchObject({
      protocolVersion: 1,
      delivery: "poll-on-resume",
      submissionAuthority: false,
    });
    const command = {
      id: "api-steering",
      expectedRevision: 0,
      actor: "person",
      channel: "app",
      action: "steer",
      payload: { instruction: "Find roles using my design coursework" },
    };
    const response = await app.inject({
      url: "/api/workspace/commands",
      method: "POST",
      headers,
      payload: command,
    });
    expect(response.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          url: "/api/workspace/commands",
          method: "POST",
          headers,
          payload: command,
        })
      ).json(),
    ).toEqual(response.json());
    expect(
      (
        await app.inject({
          url: "/api/workspace/commands",
          method: "POST",
          headers,
          payload: { ...command, id: "stale-api" },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          url: "/api/workspace/commands",
          method: "POST",
          headers,
          payload: {
            ...command,
            id: "bad-api",
            expectedRevision: 1,
            action: "grant",
          },
        })
      ).statusCode,
    ).toBe(400);
    const state = (await app.inject({ url: "/api/workspace", headers })).json();
    expect(state.revision).toBe(1);
    expect(state.steering).toHaveLength(1);
    expect(state.steering[0].status).toBe("pending");
  } finally {
    await app.close();
  }
});
it("keeps auditable decisions available through bounded ordered history pages", () => {
  const { s, run } = setup();
  run("steer", { instruction: "Look at my coursework" }, "person", "app");
  run("steer", { instruction: "Hold new applications today" }, "person", "app");
  const first = s.workspace.history(0, 1);
  expect(first.events).toHaveLength(1);
  expect(first.hasMore).toBe(true);
  expect(first.events[0].command).toMatchObject({
    actor: "person",
    action: "steer",
    payload: { instruction: "Look at my coursework" },
  });
  const second = s.workspace.history(first.cursor, 1);
  expect(second.events[0].command.payload).toMatchObject({
    instruction: "Hold new applications today",
  });
  expect(second.hasMore).toBe(false);
});
it("preserves completed outputs and selected records when an owner refreshes only run progress", () => {
  const { s, run } = setup();
  run("run", {
    run: {
      id: "daily",
      operation: "daily-flow",
      label: "Daily search",
      owner: "agent-one",
      status: "running",
      phase: "Sync",
      outputs: ["Reconciled app-one"],
      recordIds: ["app-one"],
      nextAction: "Review portfolio",
    },
  });
  run("run", {
    run: {
      id: "daily",
      operation: "daily-flow",
      label: "Daily search",
      owner: "agent-one",
      status: "running",
      phase: "Evidence",
    },
  });
  expect(s.workspace.snapshot().runs[0]).toMatchObject({
    phase: "Evidence",
    outputs: ["Reconciled app-one"],
    recordIds: ["app-one"],
    nextAction: "Review portfolio",
  });
});
it("does not carry an old successful checkpoint into newly expanded source scope", () => {
  const { s, run } = setup();
  const source = {
    id: "projects",
    label: "Projects",
    kind: "files",
    scope: "Portfolio A",
    authorizationRef: "User selected folder A",
    coverage: "complete",
    checkedAt: "2026-10-26T18:00:00.000Z",
    checkedThrough: "2026-10-26T17:00:00.000Z",
    cursor: "page-2",
  };
  run("source", { source });
  run("source", {
    source: {
      ...source,
      scope: "Portfolio A and B",
      authorizationRef: "User selected both",
      coverage: "partial",
      checkedAt: "2026-10-27T18:00:00.000Z",
    },
  });
  expect(s.workspace.snapshot().sources[0].lastSuccessful).toBeNull();
});
it("refuses silently changed question choices or dependent records under an existing identity", () => {
  const { s, run } = setup();
  const question = {
    id: "layout",
    prompt: "Which room layout did you choose?",
    kind: "choice",
    options: ["A", "B"],
    recordIds: ["app-one"],
  };
  run("question", { question });
  expect(() =>
    run("question", { question: { ...question, options: ["A", "C"] } }),
  ).toThrow(/identity/i);
  expect(() =>
    run("question", { question: { ...question, recordIds: ["app-two"] } }),
  ).toThrow(/identity/i);
  expect(() =>
    run("question", { question: { ...question, kind: "text" } }),
  ).toThrow(/identity/i);
  expect(s.workspace.snapshot().questions[0]).toMatchObject({
    options: ["A", "B"],
    recordIds: ["app-one"],
    kind: "choice",
  });
});
it("requires identifiable verified material while allowing a sourced URL and exact answer inventory", () => {
  const { s, run } = setup(),
    manifest = demoManifest();
  s.importManifest(manifest, s.dir);
  const applicationId = manifest.applications[0].id;
  const material = {
    id: "missing-resume",
    applicationId,
    attemptKey: "attempt-one",
    label: "Resume",
    role: "resume",
    mediaType: "application/pdf",
    coverage: "verified",
  };
  expect(() => run("material", { material })).toThrow(
    /verified material.*identity/i,
  );
  run("material", {
    material: {
      ...material,
      id: "missing-history",
      coverage: "recovery-needed",
    },
  });
  run("material", {
    material: {
      ...material,
      id: "portfolio-link",
      role: "portfolio",
      mediaType: "text/uri-list",
      reference: "https://portfolio.example/work",
      support: [{ label: "Final application form", reference: "archive/form" }],
    },
  });
  run("material", {
    material: {
      ...material,
      id: "exact-answer",
      role: "answer",
      mediaType: "text/plain",
      questions: [
        {
          prompt: "Which project shows your approach?",
          answer: "The studio redesign in my portfolio.",
          status: "answered",
        },
      ],
    },
  });
  expect(s.workspace.snapshot().materials).toHaveLength(3);
});
it("compares source checkpoint times chronologically across valid ISO precisions", () => {
  const { s, run } = setup();
  const source = {
    id: "projects",
    label: "Projects",
    kind: "files",
    scope: "Portfolio",
    authorizationRef: "User selected folder",
    coverage: "complete",
    checkedAt: "2026-10-26T18:00:00Z",
    checkedFrom: "2026-10-26T17:00:00Z",
    checkedThrough: "2026-10-26T17:00:00.001Z",
  };
  expect(() => run("source", { source })).not.toThrow();
  expect(() =>
    run("source", {
      source: { ...source, checkedAt: "2026-10-26T18:00:00.001Z" },
    }),
  ).not.toThrow();
  expect(s.workspace.snapshot().sources[0].checkedAt).toBe(
    "2026-10-26T18:00:00.001Z",
  );
});
