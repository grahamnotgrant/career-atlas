import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { Store } from "../server/store";
import { dataDirectory } from "../server/paths";
const [manifestPath, opportunityPath] = process.argv.slice(2);
if (!manifestPath || !opportunityPath)
  throw new Error(
    "Usage: npm run import:history -- MANIFEST.json OPPORTUNITIES.json",
  );
const manifestFile = resolve(manifestPath);
// Parse both inputs before opening the database. The store commits both together.
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
const opportunities = JSON.parse(
  readFileSync(resolve(opportunityPath), "utf8"),
);
const store = new Store(dataDirectory());
try {
  console.log(
    JSON.stringify(
      store.importHistory(manifest, opportunities, dirname(manifestFile)),
    ),
  );
} finally {
  store.close();
}
