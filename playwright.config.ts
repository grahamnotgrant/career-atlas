import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const data =
  process.env.CAREER_FLOW_TEST_DATA ??
  mkdtempSync(join(tmpdir(), "career-flow-browser-"));
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:4399", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run demo && npm start",
    env: { CAREER_FLOW_DATA: data, PORT: "4399" },
    url: "http://127.0.0.1:4399/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
  reporter: "list",
});
