import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../server/paths";
const dir = dataDirectory(),
  url = process.env.CAREER_FLOW_URL ?? "http://127.0.0.1:4317";
const [action = "state", payload = "{}"] = process.argv.slice(2);
try {
  const headers = {
    Authorization: `Bearer ${readFileSync(join(dir, "control-token"), "utf8").trim()}`,
    "Content-Type": "application/json",
  };
  if (action === "state") {
    const r = await fetch(`${url}/api/career`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(await r.text());
    console.log(JSON.stringify(await r.json(), null, 2));
  } else {
    let request: unknown, path: string;
    if (action === "retry") {
      path = resolve(payload);
      request = JSON.parse(readFileSync(path, "utf8"));
    } else {
      const state = await fetch(`${url}/api/career`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!state.ok) throw new Error(await state.text());
      const { revision } = await state.json();
      const id = randomUUID();
      request = {
        id,
        expectedRevision: revision,
        action,
        payload: JSON.parse(
          payload.startsWith("@")
            ? readFileSync(resolve(payload.slice(1)), "utf8")
            : payload,
        ),
      };
      mkdirSync(join(dir, "requests"), { recursive: true, mode: 0o700 });
      path = join(dir, "requests", `${id}.json`);
      writeFileSync(path, JSON.stringify(request, null, 2), {
        flag: "wx",
        mode: 0o600,
      });
    }
    console.error(`Saved request: ${path}`);
    const r = await fetch(`${url}/api/career/commands`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(15000),
    });
    const text = await r.text();
    console.log(text);
    if (!r.ok) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
