import { afterEach, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, hash } from "../server/store";
import { seedWorkspaceDemo } from "../server/workspace-demo";
import {
  backupData,
  restoreData,
  exportSnapshot,
  watchWorkbook,
} from "../server/operations";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
it("exports workspace revisions and restores durable instructions without credentials", async () => {
  const root = mkdtempSync(join(tmpdir(), "atlas-workspace-portable-"));
  roots.push(root);
  const dir = join(root, "data");
  const store = new Store(dir);
  const send = (id: string, instruction: string) =>
    store.workspace.command({
      id,
      expectedRevision: store.workspace.revision(),
      actor: "person",
      channel: "app",
      action: "steer",
      payload: { instruction },
    });
  send(
    "instruction-one",
    "Review the project portfolio before drafting claims",
  );
  expect(exportSnapshot(dir).revisions.workspace_state).toBe(1);
  const watcher = watchWorkbook(dir, 25);
  try {
    const status = () =>
      JSON.parse(
        readFileSync(join(dir, "exports", "workbook-status.json"), "utf8"),
      );
    await expect
      .poll(
        () => {
          try {
            return status().revisions.workspace_state;
          } catch {
            return null;
          }
        },
        { timeout: 10000 },
      )
      .toBe(1);
    send("instruction-two", "Ask about my contribution to the volunteer event");
    await expect
      .poll(() => status().revisions.workspace_state, { timeout: 10000 })
      .toBe(2);
    const backup = backupData(dir, join(root, "backup"));
    restoreData(backup.path, join(root, "restored"));
    const restored = new Store(join(root, "restored"));
    try {
      expect(
        restored.workspace.snapshot().steering.map((x) => x.instruction),
      ).toEqual(store.workspace.snapshot().steering.map((x) => x.instruction));
      expect(restored.workspace.revision()).toBe(2);
      expect(restored.token).not.toBe(store.token);
      expect(restored.workspace.snapshot().exportHealth.state).toBe(
        "unavailable",
      );
    } finally {
      restored.close();
    }
  } finally {
    watcher();
    store.close();
  }
});

it("validates workspace-only managed materials during backup and restore", () => {
  const root = mkdtempSync(join(tmpdir(), "atlas-material-backup-"));
  roots.push(root);
  const dir = join(root, "data");
  const store = new Store(dir);
  try {
    seedWorkspaceDemo(store);
    expect(store.workspace.snapshot().facts).toHaveLength(3);
    expect(() => seedWorkspaceDemo(store)).toThrow("empty");
    const bytes = Buffer.from("fictional original portfolio bytes");
    const digest = hash(bytes);
    writeFileSync(join(dir, "artifacts", digest), bytes);
    store.workspace.command({
      id: "material-backup",
      expectedRevision: store.workspace.revision(),
      actor: "fixture-agent",
      channel: "agent",
      action: "material",
      payload: {
        material: {
          id: "portfolio-original",
          applicationId: "example-design",
          attemptKey: "portfolio-attempt",
          label: "Original portfolio",
          role: "portfolio",
          mediaType: "application/octet-stream",
          sha256: digest,
          coverage: "verified",
        },
      },
    });
    const backup = backupData(dir, join(root, "valid-backup"));
    restoreData(backup.path, join(root, "valid-restore"));
    expect(
      readFileSync(join(root, "valid-restore", "artifacts", digest)),
    ).toEqual(bytes);
    writeFileSync(join(dir, "artifacts", digest), "changed bytes");
    expect(() => backupData(dir, join(root, "tampered-backup"))).toThrow(
      /hash mismatch/i,
    );
    const manifestPath = join(backup.path, "backup.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    delete manifest.files[`artifacts/${digest}`];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() =>
      restoreData(backup.path, join(root, "incomplete-restore")),
    ).toThrow();
  } finally {
    store.close();
  }
});
