import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
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
    const evidence = readFileSync("skills/uncover-evidence/SKILL.md", "utf8");
    expect(evidence).toContain("facts.md");
    expect(evidence).toMatch(/voice/i);
    expect(evidence).toContain("Never require a voice tool");
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
