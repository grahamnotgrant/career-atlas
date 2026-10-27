import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../server/paths";

const dir = dataDirectory();
const url = process.env.CAREER_FLOW_URL ?? "http://127.0.0.1:4317";
try {
  const positional: string[] = [];
  let expectedRevision: number | undefined;
  for (const argument of process.argv.slice(2)) {
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    if (!argument.startsWith("--expected-revision="))
      throw new Error(`Unknown option: ${argument}`);
    if (expectedRevision !== undefined)
      throw new Error("Duplicate --expected-revision option.");
    const value = argument.slice("--expected-revision=".length);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
      throw new Error(
        "Invalid --expected-revision: use a nonnegative safe integer.",
      );
    expectedRevision = Number(value);
  }
  if (positional.length > 2)
    throw new Error("Expected an action and one JSON payload or file path.");
  const [action = "state", input = "{}"] = positional;
  if (
    expectedRevision !== undefined &&
    ["retry", "state", "capabilities"].includes(action)
  )
    throw new Error(`${action} does not accept an overriding revision option.`);
  if (action === "approve-fact" && expectedRevision === undefined)
    throw new Error(
      "approve-fact requires --expected-revision=<reviewed revision> from the state reviewed by the person.",
    );
  const headers = {
    Authorization: `Bearer ${readFileSync(join(dir, "control-token"), "utf8").trim()}`,
    "Content-Type": "application/json",
  };
  const readState = async (path = "/api/workspace") => {
    const response = await fetch(`${url}${path}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  };
  if (action === "state" || action === "capabilities") {
    console.log(
      JSON.stringify(
        await readState(
          action === "capabilities" ? "/api/workspace/capabilities" : undefined,
        ),
        null,
        2,
      ),
    );
  } else {
    let request: unknown;
    let path: string;
    if (action === "retry") {
      path = resolve(input);
      request = JSON.parse(readFileSync(path, "utf8"));
    } else {
      const payload = JSON.parse(
        input.startsWith("@")
          ? readFileSync(resolve(input.slice(1)), "utf8")
          : input,
      );
      const revision = expectedRevision ?? (await readState()).revision;
      const id = randomUUID();
      request = {
        id,
        expectedRevision: revision,
        actor: process.env.CAREER_FLOW_AGENT_ID ?? "agent",
        channel: action === "import-session" ? "import" : "agent",
        action,
        payload: action === "import-session" ? { session: payload } : payload,
      };
      mkdirSync(join(dir, "requests"), { recursive: true, mode: 0o700 });
      path = join(dir, "requests", `${id}.json`);
      writeFileSync(path, JSON.stringify(request, null, 2), {
        mode: 0o600,
        flag: "wx",
      });
    }
    console.error(`Saved request: ${path}`);
    const response = await fetch(`${url}/api/workspace/commands`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(15000),
    });
    console.log(await response.text());
    if (!response.ok) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
