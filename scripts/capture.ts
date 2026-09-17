import { chromium, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const target = process.argv[2] ?? "http://127.0.0.1:4317",
  output = process.argv[3];
if (!output) throw new Error("Pass URL and a private screenshot directory.");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
      viewport: { width: 1512, height: 1000 },
    }),
    page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(target);
  await expect(
    page.getByRole("button", {
      name: /Watching application list|Saved on this device/,
    }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const s = await (await fetch("/api/snapshot")).json();
    await fetch("/api/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        expectedRevision: s.view.revision,
        action: "reset",
        payload: {},
      }),
    });
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "neutral");
  await page.screenshot({
    path: `${output}/overview.png`,
    fullPage: true,
    animations: "disabled",
  });
  const company = await page.evaluate(async () => {
    const snapshot = await (await fetch("/api/snapshot")).json();
    const candidate = snapshot.applications.find(
      (a: {
        company: string;
        evidence: { kind: string; mediaType: string }[];
      }) =>
        a.evidence.some(
          (e) => e.kind === "resume" && e.mediaType === "application/pdf",
        ),
    );
    if (!candidate)
      throw new Error("Capture requires an application with a PDF resume.");
    return candidate.company as string;
  });
  await page.getByRole("button", { name: "Find an application" }).click();
  await page
    .getByRole("textbox", { name: "Find an application", exact: true })
    .fill(company);
  await expect(page.locator(".search-result")).toHaveCount(1);
  await page.screenshot({
    path: `${output}/search.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.locator(".search-result").click();
  await expect(page.getByRole("dialog")).toContainText(company);
  await page.screenshot({
    path: `${output}/application.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Resume ↗", exact: true }).click();
  await expect(page.locator("canvas[data-rendered=true]")).toBeVisible({
    timeout: 20000,
  });
  expect(context.pages()).toHaveLength(1);
  await page.screenshot({
    path: `${output}/resume-popup.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Application submitted");
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Find an application", exact: true }),
  ).toHaveValue(company);
  await page.getByRole("button", { name: "Close popup" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: `${output}/mobile.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Reset view" }).click();
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "neutral");
  writeFileSync(
    `${output}/browser-report.json`,
    JSON.stringify(
      {
        pdfRendered: true,
        newTabs: 0,
        backRestoresSearch: true,
        narrowOverflow: false,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
  console.log("Real-data PDF, Back navigation and viewport checks passed.");
} finally {
  await browser.close();
}
