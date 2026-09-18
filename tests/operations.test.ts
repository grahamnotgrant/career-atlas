import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import ExcelJS from "exceljs";
import { Store, hash } from "../server/store";
import {
  backupData,
  restoreData,
  exportSnapshot,
  exportWorkbook,
  watchWorkbook,
} from "../server/operations";
const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "atlas-ops-")),
    dir = join(root, "data");
  roots.push(root);
  const store = new Store(dir);
  return { root, dir, store };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
describe("portable operations", () => {
  it("backs up a live WAL database, evidence and sessions; restores into a fresh directory without token", () => {
    const { root, dir, store } = fixture(),
      data = Buffer.from("an exact resume"),
      digest = hash(data);
    store.db
      .prepare("INSERT INTO applications VALUES (?,?)")
      .run("a", JSON.stringify({ company: "Original" }));
    store.db
      .prepare("INSERT INTO evidence VALUES (?,?,?,?)")
      .run("e", "a", "{}", digest);
    writeFileSync(join(dir, "artifacts", digest), data);
    mkdirSync(join(dir, "sessions"));
    writeFileSync(join(dir, "sessions", "resume.json"), "{}");
    const result = backupData(dir, join(root, "backup"));
    store.db
      .prepare("UPDATE applications SET body=?")
      .run(JSON.stringify({ company: "Later" }));
    restoreData(result.path, join(root, "restored"));
    const restored = exportSnapshot(join(root, "restored"));
    expect(
      JSON.parse(String(restored.tables.applications[0].body)).company,
    ).toBe("Original");
    expect(readFileSync(join(root, "restored", "artifacts", digest))).toEqual(
      data,
    );
    expect(existsSync(join(root, "restored", "control-token"))).toBe(false);
    expect(existsSync(join(root, "restored", "sessions", "resume.json"))).toBe(
      true,
    );
    expect(() => restoreData(result.path, dir)).toThrow("already exists");
    store.close();
  });
  it("refuses tampered files, traversal, symlinks and an occupied operation lock", () => {
    const { root, dir, store } = fixture();
    const backup = backupData(dir, join(root, "backup"));
    writeFileSync(join(backup.path, "career.sqlite"), "corrupt");
    expect(() => restoreData(backup.path, join(root, "bad"))).toThrow(
      "hash mismatch",
    );
    expect(existsSync(join(root, "bad"))).toBe(false);
    const manifest = JSON.parse(
      readFileSync(join(backup.path, "backup.json"), "utf8"),
    );
    manifest.files = {
      "../escaped": hash("x"),
      "career.sqlite": hash("corrupt"),
    };
    writeFileSync(join(backup.path, "backup.json"), JSON.stringify(manifest));
    expect(() => restoreData(backup.path, join(root, "bad"))).toThrow("Unsafe");
    mkdirSync(join(dir, ".operations.lock"));
    expect(() => backupData(dir, join(root, "blocked"))).toThrow("owns");
    rmSync(join(dir, ".operations.lock"), { recursive: true });
    symlinkSync(join(root, "backup"), join(dir, "unsafe"));
    expect(() => backupData(dir, join(root, "symlink"))).toThrow("Symlinks");
    store.close();
  });
  it("exports 1200 records to XLSX as literal strings and includes exact revision and JSON", async () => {
    const { root, dir, store } = fixture();
    store.db.exec("BEGIN");
    for (let i = 0; i < 1200; i++)
      store.db.prepare("INSERT INTO applications VALUES (?,?)").run(
        String(i),
        JSON.stringify({
          company: i === 0 ? '=HYPERLINK("https://bad")' : `Company ${i}`,
          role: "Engineer",
          notes: i === 0 ? "x".repeat(40000) : "",
        }),
      );
    store.db
      .prepare("INSERT INTO metadata VALUES (?,?)")
      .run("generation", "42");
    store.db.exec("COMMIT");
    store.db
      .prepare("UPDATE career_state SET revision=7,body=? WHERE id=1")
      .run(
        JSON.stringify({
          families: [
            {
              id: "ai",
              name: "AI Implementation",
              rank: 1,
              evidence: ["Built a workflow"],
              rationale: "Relevant work",
            },
          ],
          templates: [
            {
              id: "template",
              familyId: "ai",
              version: 2,
              content: "Approved text",
              claims: ["Built workflow"],
              approvedAt: "2026-09-17T00:00:00Z",
            },
          ],
        }),
      );
    store.db
      .prepare("INSERT INTO opportunities VALUES (?,?,?)")
      .run(
        "opp",
        "job-one",
        JSON.stringify({
          id: "opp",
          applicationId: "0",
          company: "Example",
          title: "Engineer",
          roleFamilyId: "ai",
          templateId: "template",
          lifecycle: "confirmed",
          compensation: { currency: "USD", annualBase: 175000 },
          offer: {
            currency: "USD",
            base: 180000,
            bonus: 10000,
            equity: "Options",
            decision: "pending",
          },
          provenance: [],
        }),
      );
    const result = await exportWorkbook(dir, join(root, "apps.xlsx"));
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(result.path);
    const readable = book.getWorksheet("Search records")!;
    const semanticHeader = readable.getRow(1).values as string[];
    expect(
      readable.getRow(2).getCell(semanticHeader.indexOf("Role family")).value,
    ).toBe("AI Implementation");
    expect(
      readable.getRow(2).getCell(semanticHeader.indexOf("Resume template"))
        .value,
    ).toBe("AI Implementation · v2");
    expect(
      readable.getRow(2).getCell(semanticHeader.indexOf("Annual base")).value,
    ).toBe(175000);
    expect(book.getWorksheet("Offer terms")!.rowCount).toBe(2);
    expect(result.revisions.career_state).toBe(7);
    const sheet = book.getWorksheet("applications")!;
    expect(sheet.rowCount).toBe(1201);
    const header = sheet.getRow(1).values as string[],
      col = header.indexOf("company");
    expect(sheet.getRow(2).getCell(col).value).toBe(
      '=HYPERLINK("https://bad")',
    );
    expect(sheet.getRow(2).getCell(col).type).toBe(ExcelJS.ValueType.String);
    const snapshot = JSON.parse(readFileSync(result.jsonPath, "utf8"));
    expect(snapshot.revisions.generation).toBe("42");
    expect(JSON.parse(snapshot.tables.applications[0].body).notes).toHaveLength(
      40000,
    );
    await expect(exportWorkbook(dir, result.path)).rejects.toThrow(
      "already exists",
    );
    store.close();
  });
  it("reports export lock failure then retries, without altering canonical records", async () => {
    const { dir, store } = fixture();
    mkdirSync(join(dir, ".operations.lock"));
    const stop = watchWorkbook(dir, 20);
    await new Promise((r) => setTimeout(r, 80));
    const status = () =>
      JSON.parse(
        readFileSync(join(dir, "exports", "workbook-status.json"), "utf8"),
      );
    expect(status().state).toBe("error");
    rmSync(join(dir, ".operations.lock"), { recursive: true });
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 20));
      if (status().state === "current") break;
    }
    expect(status().state).toBe("current");
    expect(
      store.db.prepare("SELECT count(*) AS n FROM applications").get()!.n,
    ).toBe(0);
    stop();
    store.close();
  });
});
