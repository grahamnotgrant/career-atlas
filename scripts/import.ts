import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { Store } from "../server/store";
import { dataDirectory } from "../server/paths";
const path = process.argv[2];
if (!path) throw new Error("Usage: npm run import -- /path/to/manifest.json");
const file = resolve(path),
  store = new Store(dataDirectory());
try {
  console.log(
    JSON.stringify(
      store.importManifest(
        JSON.parse(readFileSync(file, "utf8")),
        dirname(file),
      ),
    ),
  );
} finally {
  store.close();
}
