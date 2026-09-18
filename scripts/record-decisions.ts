import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Store } from "../server/store";
import { dataDirectory } from "../server/paths";

const usage = `Usage:
  npm run decisions -- apply /private/decisions.json

Each entry: {applicationId, status: "rejected" | "closed", date: "YYYY-MM-DD",
source, text, label?, force?}. The message text becomes feedback evidence, a
decision event cites it, and the application's status changes. Entries for
applications already decided are skipped unless they set force.`;

interface Decision {
  applicationId: string;
  company?: string;
  status: "rejected" | "closed";
  date: string;
  label?: string;
  source: string;
  text: string;
  force?: boolean;
}
const [action, path] = process.argv.slice(2);
if (action !== "apply" || !path) throw new Error(usage);
const entries = JSON.parse(readFileSync(resolve(path), "utf8")) as Decision[];
const store = new Store(dataDirectory());
const result = { recorded: 0, skipped: [] as string[], failed: [] as string[] };
try {
  for (const entry of entries) {
    const name = entry.company ?? entry.applicationId;
    if (
      !["rejected", "closed"].includes(entry.status) ||
      !entry.date ||
      !entry.text
    ) {
      result.failed.push(`${name}: needs status, date and text`);
      continue;
    }
    try {
      store.recordDecision(entry.applicationId, entry);
      result.recorded++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      (/already/.test(message) ? result.skipped : result.failed).push(
        `${name}: ${message}`,
      );
    }
  }
} finally {
  store.close();
}
console.log(JSON.stringify(result, null, 2));
if (result.failed.length) process.exitCode = 1;
