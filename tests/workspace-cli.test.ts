import { afterEach, expect, it } from "vitest";
import { Store } from "../server/store";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
it("CLI archives the exact authenticated command and retries its original ID after uncertain delivery", async () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-workspace-cli-"));
  roots.push(dir);
  writeFileSync(join(dir, "control-token"), "fictional-token", { mode: 0o600 });
  const seen: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    if (req.headers.authorization !== "Bearer fictional-token") {
      res.writeHead(401).end();
      return;
    }
    if (req.url === "/api/workspace") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ protocolVersion: 1, revision: 7 }));
      return;
    }
    if (req.url === "/api/workspace/commands") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      seen.push(JSON.parse(Buffer.concat(chunks).toString()));
      if (seen.length === 1) {
        req.socket.destroy();
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ revision: 8, result: { saved: true } }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  const env = {
    ...process.env,
    CAREER_FLOW_DATA: dir,
    CAREER_FLOW_URL: `http://127.0.0.1:${address.port}`,
    CAREER_FLOW_AGENT_ID: "person",
  };
  const cli = resolve("node_modules/tsx/dist/cli.mjs");
  try {
    await expect(
      exec(
        process.execPath,
        [
          cli,
          "scripts/workspace-control.ts",
          "steer",
          JSON.stringify({ instruction: "Prioritize portfolio roles" }),
        ],
        { env },
      ),
    ).rejects.toBeDefined();
    const [name] = readdirSync(join(dir, "requests"));
    const path = join(dir, "requests", name);
    const request = JSON.parse(readFileSync(path, "utf8"));
    expect(request).toMatchObject({
      actor: "person",
      channel: "agent",
      expectedRevision: 7,
      action: "steer",
      payload: { instruction: "Prioritize portfolio roles" },
    });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    await expect(
      exec(
        process.execPath,
        [
          cli,
          "scripts/workspace-control.ts",
          "retry",
          path,
          "--expected-revision=8",
        ],
        { env },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringMatching(/retry.*revision/i),
    });
    expect(seen).toEqual([request]);
    const retried = await exec(
      process.execPath,
      [cli, "scripts/workspace-control.ts", "retry", path],
      { env },
    );
    expect(JSON.parse(retried.stdout)).toEqual({
      revision: 8,
      result: { saved: true },
    });
    expect(seen).toEqual([request, request]);
    expect(retried.stdout + retried.stderr).not.toContain("fictional-token");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});

it("requires the reviewed revision and rejects approving changed support with unchanged wording", async () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-workspace-cli-approval-"));
  roots.push(dir);
  const store = new Store(dir);
  const wording = "I chose the portfolio layout.";
  const fact = {
    id: "portfolio-layout",
    label: "Portfolio layout",
    observation: "Two layouts were compared.",
    contribution: "Chose the layout.",
    ownership: "user-reported",
    outcome: "implemented",
    support: [{ label: "Original review", reference: "portfolio/review-v1" }],
    wording,
  };
  const recordFact = (id: string, reference: string) =>
    store.workspace.command({
      id,
      expectedRevision: store.workspace.revision(),
      actor: "evidence-agent",
      channel: "agent",
      action: "fact",
      payload: { fact: { ...fact, support: [{ label: "Review", reference }] } },
    });
  recordFact("first-observation", "portfolio/review-v1");
  const reviewedRevision = store.workspace.revision();
  recordFact("changed-support", "portfolio/review-v2");
  let reads = 0;
  const seen: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${store.token}`) {
      res.writeHead(401).end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/workspace") {
      reads++;
      res.end(JSON.stringify(store.workspace.snapshot()));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const command = JSON.parse(Buffer.concat(chunks).toString());
    seen.push(command);
    try {
      res.end(JSON.stringify(store.workspace.command(command)));
    } catch (error) {
      res.writeHead((error as { statusCode?: number }).statusCode ?? 500);
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  const env = {
    ...process.env,
    CAREER_FLOW_DATA: dir,
    CAREER_FLOW_URL: `http://127.0.0.1:${address.port}`,
    CAREER_FLOW_AGENT_ID: "person",
  };
  const approve = (...flags: string[]) =>
    exec(
      process.execPath,
      [
        resolve("node_modules/tsx/dist/cli.mjs"),
        "scripts/workspace-control.ts",
        "approve-fact",
        JSON.stringify({ id: fact.id, wording }),
        ...flags,
      ],
      { env },
    );
  try {
    await expect(approve()).rejects.toMatchObject({
      stderr: expect.stringContaining("--expected-revision"),
    });
    expect(reads).toBe(0);
    expect(seen).toEqual([]);
    await expect(
      approve(`--expected-revision=${reviewedRevision}`),
    ).rejects.toMatchObject({
      stdout: expect.stringMatching(/records changed/i),
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].expectedRevision).toBe(reviewedRevision);
    expect(reads).toBe(0);
    expect(store.workspace.snapshot().facts[0].wordingApproval).toBeNull();
    expect(store.workspace.revision()).toBe(reviewedRevision + 1);

    const currentRevision = store.workspace.snapshot().revision;
    const approved = await approve(`--expected-revision=${currentRevision}`);
    expect(JSON.parse(approved.stdout).result.wordingApproval.text).toBe(
      wording,
    );
    const saved = readdirSync(join(dir, "requests")).map((name) =>
      JSON.parse(readFileSync(join(dir, "requests", name), "utf8")),
    );
    expect(saved.map((request) => request.expectedRevision).sort()).toEqual([
      reviewedRevision,
      currentRevision,
    ]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    store.close();
  }
});

it.each([
  ["--unknown=1"],
  ["--expected-revision"],
  ["--expected-revision="],
  ["--expected-revision=-1"],
  ["--expected-revision=1.5"],
  ["--expected-revision=Infinity"],
  ["--expected-revision=9007199254740992"],
  ["--expected-revision=1", "--expected-revision=1"],
])(
  "rejects invalid or duplicate CLI options before delivery: %s",
  async (...flags) => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-workspace-cli-options-"));
    roots.push(dir);
    const result = exec(
      process.execPath,
      [
        resolve("node_modules/tsx/dist/cli.mjs"),
        "scripts/workspace-control.ts",
        "steer",
        JSON.stringify({ instruction: "Review portfolio roles" }),
        ...flags,
      ],
      { env: { ...process.env, CAREER_FLOW_DATA: dir } },
    );
    await expect(result).rejects.toMatchObject({
      stderr: expect.stringMatching(
        /^(Unknown option|Invalid --expected-revision|Duplicate --expected-revision)/m,
      ),
    });
    expect(readdirSync(dir)).toEqual([]);
  },
);
