import { afterEach, expect, it } from "vitest";
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
