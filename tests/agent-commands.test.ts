import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { manageCommands, selectAgents } from "../scripts/agent-commands";
const roots: string[] = [];
const routes = {
  start: "docs/AGENT-START.md",
  sync: "skills/maintain-records/SKILL.md",
  change: "docs/AGENT-START.md",
  apply: "skills/run-search/SKILL.md",
  review: "skills/review-and-improve/SKILL.md",
  scout: "skills/scout-roles/SKILL.md",
  daily: "skills/daily-flow/SKILL.md",
};
const hosts = ["codex", "claude"] as const;
function project() {
  const root = mkdtempSync(join(tmpdir(), "atlas commands "));
  roots.push(root);
  for (const file of new Set([
    "AGENTS.md",
    "docs/WORKFLOW-CONTRACTS.md",
    ...Object.values(routes),
  ])) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), "Shared workflow");
  }
  return root;
}
function skillDirectory(
  root: string,
  host: (typeof hosts)[number],
  name: string,
) {
  return join(
    root,
    host === "codex" ? ".agents" : ".claude",
    "skills",
    `career-${name}`,
  );
}
function generatedFiles(root: string) {
  return hosts.flatMap((host) =>
    Object.keys(routes).flatMap((name) => {
      const dir = skillDirectory(root, host, name);
      return [
        "SKILL.md",
        ".career-atlas-owner.json",
        ...(host === "codex" ? ["agents/openai.yaml"] : []),
      ].map((file) => [
        relative(root, join(dir, file)),
        readFileSync(join(dir, file), "utf8"),
      ]);
    }),
  );
}
afterEach(() =>
  roots.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })),
);
it("installs both formats, stays idempotent, and uninstalls only its own directories", () => {
  const root = project();
  mkdirSync(join(root, ".claude"));
  writeFileSync(join(root, ".claude/settings.json"), "{}");
  const installed = manageCommands(root, "install", [...hosts]);
  expect(installed.map((entry) => entry.path).sort()).toEqual(
    hosts
      .flatMap((host) =>
        Object.keys(routes).map((name) =>
          relative(root, skillDirectory(root, host, name)),
        ),
      )
      .sort(),
  );
  expect(installed).toHaveLength(14);
  const before = generatedFiles(root);
  expect(
    manageCommands(root, "install", ["codex", "claude", "codex"]).every(
      (p) => p.state === "current",
    ),
  ).toBe(true);
  expect(generatedFiles(root)).toEqual(before);
  manageCommands(root, "uninstall", [...hosts]);
  for (const { path } of installed)
    expect(existsSync(join(root, path))).toBe(false);
  expect(readFileSync(join(root, ".claude/settings.json"), "utf8")).toBe("{}");
});
it("routes every host entrypoint through shared startup and resolvable workflows with explicit invocation", () => {
  const root = project();
  manageCommands(root, "install", [...hosts]);
  for (const host of hosts) {
    for (const [name, route] of Object.entries(routes)) {
      const dir = skillDirectory(root, host, name);
      const body = readFileSync(join(dir, "SKILL.md"), "utf8");
      const links = [...body.matchAll(/\]\(([^)]+)\)/g)].map((match) =>
        resolve(dir, match[1]),
      );
      expect(links).toEqual(
        expect.arrayContaining([
          join(root, "AGENTS.md"),
          join(root, "docs/AGENT-START.md"),
          join(root, "docs/WORKFLOW-CONTRACTS.md"),
          join(root, route),
        ]),
      );
      for (const link of links) {
        expect(relative(root, link).startsWith("..")).toBe(false);
        expect(existsSync(link)).toBe(true);
      }
      expect(body).toMatch(
        new RegExp(`^---\\nname: career-${name}\\ndescription: .+\\n`, "u"),
      );
      expect(body.match(/Common startup/g)).toHaveLength(1);
      expect(body).toContain("once per run");
      if (host === "claude") {
        expect(body).toContain("disable-model-invocation: true\n---");
        expect(body).toContain("User request: $ARGUMENTS");
        expect(existsSync(join(dir, "agents/openai.yaml"))).toBe(false);
      } else {
        const config = readFileSync(join(dir, "agents/openai.yaml"), "utf8");
        expect(config).toContain(`display_name: "Career ${name}"`);
        expect(config).toContain(
          `default_prompt: "Use $career-${name} for Career Atlas."`,
        );
        expect(config).toContain(
          "policy:\n  allow_implicit_invocation: false\n",
        );
        expect(body).not.toContain("disable-model-invocation");
      }
    }
  }
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
  for (const name of Object.keys(routes))
    expect(existsSync(join(outside, "skills", `career-${name}`))).toBe(false);
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
it("preserves a conflicting daily command before changing either host", () => {
  const root = project();
  mkdirSync(join(root, ".claude/commands"), { recursive: true });
  const path = join(root, ".claude/commands/career-daily.md");
  writeFileSync(path, "custom daily");
  expect(() => manageCommands(root, "install", [...hosts])).toThrow(
    /career-daily/,
  );
  expect(existsSync(join(root, ".agents"))).toBe(false);
  expect(existsSync(join(root, ".claude/skills"))).toBe(false);
  expect(readFileSync(path, "utf8")).toBe("custom daily");
});
it("updates owned older shortcuts and adds daily to an existing six-command installation", () => {
  const root = project();
  manageCommands(root, "install", [...hosts]);
  const expected = generatedFiles(root);
  for (const host of hosts) {
    rmSync(skillDirectory(root, host, "daily"), { recursive: true });
    const dir = skillDirectory(root, host, "start");
    const manifestPath = join(dir, ".career-atlas-owner.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    writeFileSync(join(dir, "SKILL.md"), "old managed version");
    manifest.files["SKILL.md"] = createHash("sha256")
      .update("old managed version")
      .digest("hex");
    writeFileSync(manifestPath, JSON.stringify(manifest));
  }
  const status = manageCommands(root, "status", [...hosts]);
  expect(status.filter((entry) => entry.state === "outdated")).toHaveLength(2);
  expect(status.filter((entry) => entry.state === "missing")).toHaveLength(2);
  expect(manageCommands(root, "update", [...hosts])).toHaveLength(14);
  expect(generatedFiles(root)).toEqual(expected);
});
it("refuses concurrent installers", () => {
  const root = project();
  mkdirSync(join(root, ".private/agent-commands.lock"), { recursive: true });
  expect(() => manageCommands(root, "install", ["codex"])).toThrow(
    /Another installer/,
  );
  expect(existsSync(join(root, ".agents"))).toBe(false);
});
