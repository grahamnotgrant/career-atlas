import { it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Store } from "../server/store";
import { createApp } from "../server/app";
it("career CLI saves an exact mutation and safely retries it without a second revision", async () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-cli-")),
    store = new Store(dir),
    app = await createApp(store);
  try {
    const url = await app.listen({ host: "127.0.0.1", port: 0 });
    const run = (args: string[]) =>
      promisify(execFile)(
        process.execPath,
        ["--import", "tsx", resolve("scripts/career-control.ts"), ...args],
        {
          env: { ...process.env, CAREER_FLOW_DATA: dir, CAREER_FLOW_URL: url },
          timeout: 15000,
        },
      );
    const before = JSON.parse((await run(["state"])).stdout);
    const payload = join(dir, "settings.json");
    writeFileSync(
      payload,
      JSON.stringify({ settings: { goals: "A factual goal" } }),
    );
    const first = JSON.parse((await run(["settings", `@${payload}`])).stdout);
    expect(first.revision).toBe(before.revision + 1);
    const saved = join(dir, "requests", readdirSync(join(dir, "requests"))[0]);
    const retry = JSON.parse((await run(["retry", saved])).stdout);
    expect(retry).toEqual(first);
    const current = JSON.parse((await run(["state"])).stdout);
    expect(current.revision).toBe(first.revision);
    expect(current.settings.goals).toBe("A factual goal");
  } finally {
    await app.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
