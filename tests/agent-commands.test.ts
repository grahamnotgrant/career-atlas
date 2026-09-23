import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { manageCommands, selectAgents } from "../scripts/agent-commands";
const roots: string[] = [];
function project() {
  const root = mkdtempSync(join(tmpdir(), "atlas commands "));
  roots.push(root);
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "docs/AGENT-START.md"), "Startup");
  return root;
}
afterEach(() =>
  roots.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })),
);
it("installs both formats, stays idempotent, and uninstalls only its own directories", () => {
  const root = project();
  mkdirSync(join(root, ".claude"));
  writeFileSync(join(root, ".claude/settings.json"), "{}");
  expect(manageCommands(root, "install", ["codex", "claude"])).toHaveLength(12);
  expect(
    manageCommands(root, "install", ["codex", "claude"]).every(
      (p) => p.state === "current",
    ),
  ).toBe(true);
  const text = readFileSync(
    join(root, ".claude/skills/career-start/SKILL.md"),
    "utf8",
  );
  expect(text).toContain("../../../docs/AGENT-START.md");
  expect(text).toContain("disable-model-invocation: true");
  manageCommands(root, "uninstall", ["codex", "claude"]);
  expect(existsSync(join(root, ".claude/skills/career-start"))).toBe(false);
  expect(readFileSync(join(root, ".claude/settings.json"), "utf8")).toBe("{}");
});
it("preserves edits and refuses partial installation on a conflict", () => {
  const root = project();
  manageCommands(root, "install", ["claude"]);
  const path = join(root, ".claude/skills/career-review/SKILL.md");
  writeFileSync(path, "custom");
  for (const action of ["install", "update", "uninstall"] as const)
    expect(() => manageCommands(root, action, ["codex", "claude"])).toThrow(
      /preserved/,
    );
  expect(existsSync(join(root, ".agents"))).toBe(false);
  expect(readFileSync(path, "utf8")).toBe("custom");
});
it("preserves additional files and unowned same-name skills", () => {
  const root = project();
  manageCommands(root, "install", ["codex"]);
  writeFileSync(join(root, ".agents/skills/career-start/notes.md"), "mine");
  expect(() => manageCommands(root, "uninstall", ["codex"])).toThrow(
    /preserved/,
  );
});
it("rejects symlink destinations without writing outside project", () => {
  const root = project(),
    outside = project();
  symlinkSync(outside, join(root, ".agents"));
  expect(() => manageCommands(root, "install", ["codex"])).toThrow(/symlink/);
  expect(existsSync(join(outside, "skills"))).toBe(false);
});
it("detects agent environments and requires a choice if none are present", () => {
  expect(selectAgents("auto", { PATH: "", CODEX_THREAD_ID: "test" })).toEqual([
    "codex",
  ]);
  expect(selectAgents("auto", { PATH: "", CLAUDECODE: "1" })).toEqual([
    "claude",
  ]);
  expect(() => selectAgents("auto", { PATH: "" })).toThrow(/No supported/);
  expect(() => selectAgents("other", {})).toThrow(/Choose/);
});
it("reports missing and edited status without creating config", () => {
  const root = project();
  expect(
    manageCommands(root, "status", ["codex"]).every(
      (p) => p.state === "missing",
    ),
  ).toBe(true);
  expect(existsSync(join(root, ".agents"))).toBe(false);
});
it("preserves legacy Claude commands", () => {
  const root = project();
  mkdirSync(join(root, ".claude/commands"), { recursive: true });
  writeFileSync(join(root, ".claude/commands/career-start.md"), "custom");
  expect(() => manageCommands(root, "install", ["claude"])).toThrow(
    /preserved/,
  );
});
it("updates an unchanged owned older shortcut", async () => {
  const { createHash } = await import("node:crypto");
  const root = project();
  manageCommands(root, "install", ["codex"]);
  const dir = join(root, ".agents/skills/career-start");
  const manifestPath = join(dir, ".career-atlas-owner.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  writeFileSync(join(dir, "SKILL.md"), "old managed version");
  manifest.files["SKILL.md"] = createHash("sha256")
    .update("old managed version")
    .digest("hex");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  expect(manageCommands(root, "status", ["codex"])[0].state).toBe("outdated");
  manageCommands(root, "update", ["codex"]);
  expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toContain("AGENT-START");
});
it("refuses concurrent installers", () => {
  const root = project();
  mkdirSync(join(root, ".private/agent-commands.lock"), { recursive: true });
  expect(() => manageCommands(root, "install", ["codex"])).toThrow(
    /Another installer/,
  );
  expect(existsSync(join(root, ".agents"))).toBe(false);
});
