import { it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store";
import { SourceWatcher, ledgerRows } from "../server/source-watcher";
import { demoManifest } from "../shared/demo";
import { journeys } from "../src/journey";
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((f) => f()));
function setup() {
  const root = mkdtempSync(join(tmpdir(), "career-flow-watch-"));
  const store = new Store(join(root, "data"));
  cleanups.push(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  return { root, store };
}
it("restores application, document and result-list views through persistent Back history", () => {
  const { root, store } = setup();
  store.importManifest(demoManifest(), root);
  store.command({
    id: "1",
    expectedRevision: 0,
    action: "list",
    payload: { enabled: true },
  });
  store.command({
    id: "2",
    expectedRevision: 1,
    action: "select",
    payload: { id: "demo-0" },
  });
  store.command({
    id: "3",
    expectedRevision: 2,
    action: "document",
    payload: { id: "demo-0-source" },
  });
  expect(store.getView().evidenceId).toBe("demo-0-source");
  expect(() =>
    store.command({
      id: "bad",
      expectedRevision: 3,
      action: "document",
      payload: { id: "demo-1-source" },
    }),
  ).toThrow("does not belong");
  store.command({ id: "4", expectedRevision: 3, action: "back", payload: {} });
  expect(store.getView().selectedId).toBe("demo-0");
  expect(store.getView().evidenceId).toBeNull();
  const next = new Store(store.dir);
  expect(next.snapshot().canGoBack).toBe(true);
  next.command({ id: "5", expectedRevision: 4, action: "back", payload: {} });
  expect(next.getView().list).toBe(true);
  expect(next.getView().selectedId).toBeNull();
  next.close();
});
it("reads only submitted rows, respects the year and cleans markdown", () => {
  const text =
    "## Submitted\n| 2026-09-17 | AI Engineer | **Harbor** | $180K | Remote | ATS | Receipt |\n| 2025-09-17 | AI Engineer | Old | $180K | Remote | ATS | Receipt |\n## Still queued\n| 2026-09-17 | AI Engineer | Queue | $180K | Remote | ATS | Receipt |";
  const rows = ledgerRows(text, 2026);
  expect(rows).toHaveLength(1);
  expect(rows[0].company).toBe("Harbor");
});
it("waits for stable source writes, imports a new confirmed application once, preserves selection and never edits source", () => {
  const { root, store } = setup();
  const m = demoManifest();
  m.mode = "private";
  store.importManifest(m, root);
  store.command({
    id: "select",
    expectedRevision: 0,
    action: "select",
    payload: { id: "demo-0" },
  });
  const ledger = join(root, "APPLICATIONS.md");
  mkdirSync(join(root, "receipts"));
  writeFileSync(
    ledger,
    "## Submitted\n| Date | Role | Company | Pay | Location | ATS | Evidence |\n## Still queued\n",
  );
  writeFileSync(
    join(store.dir, "source-watch.json"),
    JSON.stringify({ ledgerPath: ledger, year: 2026, intervalMs: 60000 }),
  );
  const watch = new SourceWatcher(store);
  watch.stop();
  watch.tick();
  const updated =
    "## Submitted\n| 2026-09-17 | AI Engineer | New Harbor | $180K | Remote | ATS | receipts/new-harbor-confirmation.txt |\n## Still queued\n";
  writeFileSync(ledger, updated);
  watch.tick();
  expect(store.snapshot().applications).toHaveLength(14);
  watch.tick();
  expect(store.snapshot().sync.state).toBe("review");
  writeFileSync(
    join(root, "receipts/new-harbor-confirmation.txt"),
    "New Harbor - AI Engineer\nYour application was successfully submitted.",
  );
  watch.tick();
  expect(store.snapshot().applications).toHaveLength(15);
  expect(store.getView().selectedId).toBe("demo-0");
  expect(store.getView().revision).toBe(1);
  expect(store.snapshot().sync.added).toBe(1);
  watch.tick();
  expect(store.snapshot().applications).toHaveLength(15);
  expect(readFileSync(ledger, "utf8")).toBe(updated);
});
it("missing or malformed source leaves the previous generation intact", () => {
  const { root, store } = setup();
  store.importManifest(demoManifest(), root);
  const ledger = join(root, "APPLICATIONS.md");
  writeFileSync(
    join(store.dir, "source-watch.json"),
    JSON.stringify({ ledgerPath: ledger, year: 2026 }),
  );
  const watcher = new SourceWatcher(store);
  watcher.stop();
  expect(store.snapshot().sync.state).toBe("error");
  expect(store.snapshot().applications).toHaveLength(14);
});
it("draws only recorded stages and keeps existing paths stable when a later application arrives", () => {
  const apps = demoManifest().applications,
    paths = journeys(apps);
  expect(paths).toHaveLength(apps.length);
  const pending = paths.find((p) => p.id === "demo-13")!;
  expect(pending.stages).toEqual(["applied"]);
  const more = [
    ...apps,
    { ...apps[13], id: "later-record", submitted: "2026-09-20" },
  ];
  expect(journeys(more).find((p) => p.id === "demo-13")?.path).toBe(
    pending.path,
  );
});
