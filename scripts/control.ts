import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../server/paths";
const url = process.env.CAREER_FLOW_URL ?? "http://127.0.0.1:4317";
const headers = {
  Authorization: `Bearer ${readFileSync(join(dataDirectory(), "control-token"), "utf8").trim()}`,
  "Content-Type": "application/json",
};
const [action, payload] = process.argv.slice(2);
const res = await fetch(`${url}/api/snapshot`, { headers });
if (!res.ok) throw new Error(await res.text());
const state = await res.json();
if (!action || action === "state") {
  console.log(JSON.stringify(state, null, 2));
} else {
  const r = await fetch(`${url}/api/commands`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: randomUUID(),
      expectedRevision: state.view.revision,
      action,
      payload: JSON.parse(payload ?? "{}"),
    }),
  });
  console.log(await r.text());
  if (!r.ok) process.exitCode = 1;
}
