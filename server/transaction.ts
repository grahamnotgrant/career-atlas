import type { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
/** Nested imports share one commit boundary; ordinary writes acquire the writer lock before reads. */
export function transaction(db: DatabaseSync) {
  const nested = db.isTransaction,
    name = `atlas_${randomBytes(8).toString("hex")}`;
  db.exec(nested ? `SAVEPOINT ${name}` : "BEGIN IMMEDIATE");
  return {
    commit() {
      db.exec(nested ? `RELEASE SAVEPOINT ${name}` : "COMMIT");
    },
    rollback() {
      if (nested) {
        db.exec(`ROLLBACK TO SAVEPOINT ${name}`);
        db.exec(`RELEASE SAVEPOINT ${name}`);
      } else db.exec("ROLLBACK");
    },
  };
}
