import { it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../server/store";
import { CareerStore } from "../server/career";
import { companyIdentity, opportunitySchema } from "../shared/career";
it("groups legacy confirmed and discovered employer spellings with one atomic idempotent migration", () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-company-")),
    store = new Store(dir);
  try {
    for (const [id, companyKey] of [
      ["one", "trm labs"],
      ["two", "trmlabs"],
    ]) {
      const record = opportunitySchema.parse({
        id,
        jobKey: id,
        company: "TRM Labs",
        companyKey,
        title: "Different role " + id,
        url: "",
        description: "",
        location: "",
      });
      store.db
        .prepare("INSERT INTO opportunities VALUES (?,?,?)")
        .run(id, id, JSON.stringify(record));
    }
    store.db
      .prepare("DELETE FROM metadata WHERE key='company-key-version'")
      .run();
    const before = store.career.revision();
    new CareerStore(store.db, dir);
    expect(
      store.career.snapshot().opportunities.map((o) => o.companyKey),
    ).toEqual(["trmlabs", "trmlabs"]);
    expect(store.career.revision()).toBe(before + 1);
    new CareerStore(store.db, dir);
    expect(store.career.revision()).toBe(before + 1);
    expect(
      store.db
        .prepare(
          "SELECT COUNT(*) AS n FROM career_audit WHERE command_id='migration-company-keys-v1'",
        )
        .get()!.n,
    ).toBe(1);
    const company = "École 東京";
    const record = opportunitySchema.parse({
      id: "new",
      jobKey: "new",
      company,
      companyKey: "wrong",
      title: "Engineer",
      url: "",
      description: "",
      location: "",
    });
    store.career.command({
      id: "insert",
      expectedRevision: store.career.revision(),
      action: "opportunities",
      payload: { opportunities: [record] },
    });
    expect(
      store.career.snapshot().opportunities.find((o) => o.id === "new")!
        .companyKey,
    ).toBe(companyIdentity(company));
    expect(companyIdentity(company)).toBe("école東京");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
