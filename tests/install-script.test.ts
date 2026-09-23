import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("the install script parses, targets Node 24, and is what the README tells an assistant to run", () => {
  execFileSync("sh", ["-n", "scripts/install.sh"]);
  const script = readFileSync("scripts/install.sh", "utf8");
  expect(script).toContain("set -eu");
  expect(script).toContain("NEED=24");
  expect(script).toContain("atlas -- setup --commands=auto");
  expect(script).not.toMatch(/sudo|brew|fnm|nvm/);
  expect(script).toContain("SHASUMS256.txt");
  const readme = readFileSync("README.md", "utf8");
  expect(readme).toContain("scripts/install.sh | sh");
  expect(readme).toContain("If you are an AI assistant reading this");
  expect(readme).toContain("AGENTS.md");
});
