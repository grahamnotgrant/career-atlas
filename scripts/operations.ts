import {
  backupData,
  restoreData,
  exportSnapshot,
  exportWorkbook,
} from "../server/operations";
import { dataDirectory } from "../server/paths";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
const [action, destination, source] = process.argv.slice(2);
try {
  if (action === "backup" && destination)
    console.log(
      JSON.stringify(backupData(dataDirectory(), destination), null, 2),
    );
  else if (action === "restore" && destination && source)
    console.log(JSON.stringify(restoreData(source, destination), null, 2));
  else if (action === "excel")
    console.log(
      JSON.stringify(
        await exportWorkbook(dataDirectory(), destination),
        null,
        2,
      ),
    );
  else if (action === "json" && destination) {
    writeFileSync(
      resolve(destination),
      JSON.stringify(exportSnapshot(dataDirectory()), null, 2),
      { flag: "wx", mode: 0o600 },
    );
    console.log(resolve(destination));
  } else
    throw new Error(
      "Usage: npm run operations -- backup NEW_DIRECTORY | restore NEW_DIRECTORY BACKUP_DIRECTORY | excel [NEW_FILE.xlsx] | json NEW_FILE.json",
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
