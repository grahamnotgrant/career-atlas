import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../server/store";
const skills = [
  "discover-direction",
  "critique-resume",
  "uncover-evidence",
  "build-role-templates",
  "run-search",
  "review-and-improve",
  "maintain-records",
  "scout-roles",
  "daily-flow",
];
describe("portable onboarding contract", () => {
  it("ships standalone skills with resumable inputs, outputs and approval gates", () => {
    for (const skill of skills) {
      const text = readFileSync(resolve("skills", skill, "SKILL.md"), "utf8");
      for (const label of [
        "Inputs:",
        "Outputs:",
        "Approval gates:",
        "Completion checks:",
        "../SESSION.md",
        "../stop-slop/SKILL.md",
      ])
        expect(text, `${skill}: ${label}`).toContain(label);
      expect(text).not.toContain("/Users/graham");
    }
    expect(readFileSync("CLAUDE.md", "utf8")).toContain("AGENTS.md");
    const entry = readFileSync("AGENTS.md", "utf8");
    for (const name of [
      "docs/ONBOARDING.md",
      "docs/PRIVACY.md",
      "skills/stop-slop/SKILL.md",
    ])
      expect(existsSync(name)).toBe(true);
    expect(entry).toContain("single agent");
    // Onboarding order: intake, the evidence conversation, roles the user approves, templates, authorization.
    const onboarding = readFileSync("docs/ONBOARDING.md", "utf8");
    const order = [
      "current resume",
      "uncover-evidence",
      "10–20 ranked roles",
      "build-role-templates",
      "application authorization",
    ].map((s) => onboarding.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it("resolves shared contracts and local documentation links in the portable workflow", () => {
    const files = [
      "AGENTS.md",
      "CLAUDE.md",
      "README.md",
      "docs/AGENT-START.md",
      "docs/WORKFLOW-CONTRACTS.md",
      "docs/ONBOARDING.md",
      "docs/CAREER-CONTROL.md",
      "docs/RESUME-LINKING.md",
      "skills/SESSION.md",
      ...skills.map((skill) => `skills/${skill}/SKILL.md`),
    ];
    for (const file of files) {
      expect(existsSync(file), file).toBe(true);
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const target = match[1].replace(/^<|>$/g, "").split("#")[0];
        if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        expect(
          existsSync(resolve(dirname(file), target)),
          `${file}: ${target}`,
        ).toBe(true);
      }
    }
  });
  it("starts a clean session without invented experience, authorization or applications", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-onboard-"));
    const store = new Store(dir);
    try {
      const state = store.snapshot();
      expect(state.applications).toEqual([]);
      expect(state.career.opportunities).toEqual([]);
      expect(state.career.settings.experience).toBe("");
      expect(state.career.grants).toEqual([]);
      expect(state.career.templates).toEqual([]);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
