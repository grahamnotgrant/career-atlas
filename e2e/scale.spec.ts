import { test, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store";
import { createApp } from "../server/app";
import type { Application, Manifest } from "../shared/model";

test("2000 applications and 20000 events keep the visual bounded and all records searchable", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  const dir = mkdtempSync(join(tmpdir(), "atlas-scale-"));
  const store = new Store(dir);
  const apps: Application[] = Array.from({ length: 2000 }, (_, i) => {
    const status =
      i < 1800
        ? "pending"
        : i < 1900
          ? "rejected"
          : i < 1990
            ? "interview"
            : "offer";
    return {
      id: `scale-${i}`,
      company: `Company ${String(i).padStart(4, "0")}`,
      title: `AI Implementation ${i}`,
      location: "New York",
      theme: "nyc",
      compensation: "USD 180000",
      status,
      submitted: "2026-09-01",
      asOf: "2026-09-17",
      verification: "Synthetic scale receipt",
      evidence: [
        {
          id: `receipt-${i}`,
          kind: "receipt",
          label: "Synthetic confirmation",
          basis: "Synthetic performance fixture",
          text: "Your application was successfully submitted.",
        },
      ],
      events: Array.from({ length: 10 }, (_, j) => ({
        id: `event-${i}-${j}`,
        date: "2026-09-01",
        kind:
          j === 0
            ? "submission"
            : j === 9 && status === "interview"
              ? "invitation"
              : "note",
        stage:
          j === 0
            ? "applied"
            : j === 9 && status === "interview"
              ? "recruiter"
              : j === 9 && status === "offer"
                ? "offer"
                : null,
        label: j === 0 ? "Application submitted" : "Recorded note",
        detail: "Synthetic fixture only",
        evidenceIds: [`receipt-${i}`],
      })),
    };
  });
  const started = performance.now();
  store.importManifest(
    {
      version: 1,
      label: "Scale fixture",
      mode: "demo",
      coverage: "Synthetic complete fixture",
      applications: apps,
    } satisfies Manifest,
    dir,
  );
  const importMs = performance.now() - started;
  const server = await createApp(store);
  const url = await server.listen({ host: "127.0.0.1", port: 0 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    const loadStart = performance.now();
    await page.goto(url);
    await expect(
      page.getByText("2000 confirmed applications", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    const loadMs = performance.now() - loadStart;
    expect(loadMs).toBeLessThan(12000);
    const searchStart = performance.now();
    await page.getByRole("button", { name: /Find an application/ }).click();
    await expect(page.locator(".search-result")).toHaveCount(60);
    await page
      .getByRole("textbox", { name: /Find an application/ })
      .fill("Company 1999");
    await expect(page.locator(".search-result")).toHaveCount(1);
    const searchMs = performance.now() - searchStart;
    expect(searchMs).toBeLessThan(5000);
    await page.locator(".search-result").click();
    await expect(page.getByRole("dialog")).toContainText("Company 1999");
    await page.getByRole("button", { name: "Close popup" }).click();
    await page
      .getByRole("button", { name: "All records", exact: true })
      .click();
    await expect(
      page.getByText("2000 records · 2000 confirmed submissions", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".record-row")).toHaveCount(50);
    await page
      .getByRole("textbox", { name: "Search records" })
      .fill("AI Implementation 1999");
    await expect(page.locator(".record-row")).toHaveCount(1);
    expect(errors).toEqual([]);
    await testInfo.attach("scale-measurements", {
      body: JSON.stringify(
        {
          records: 2000,
          events: 20000,
          importMs,
          loadMs,
          searchMs,
          visibleDots: await page.locator(".application-node").count(),
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
  } finally {
    await page.goto("about:blank").catch(() => {});
    await server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
