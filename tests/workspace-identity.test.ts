import { it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store";
it("keeps an opaque workspace identity across reopen and separates independent workspaces", () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-identity-"));
  try {
    const first = new Store(join(dir, "first"));
    const id = first.snapshot().workspaceId;
    expect(id).toMatch(/^[a-f0-9]{48}$/);
    first.close();
    const reopen = new Store(join(dir, "first"));
    expect(reopen.snapshot().workspaceId).toBe(id);
    reopen.close();
    const second = new Store(join(dir, "second"));
    expect(second.snapshot().workspaceId).not.toBe(id);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
