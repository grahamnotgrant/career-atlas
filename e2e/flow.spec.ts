import { sceneIds } from "../shared/locations";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function openApplication(page: Page, company: string) {
  await page.getByRole("button", { name: "Find an application" }).click();
  await page
    .getByRole("textbox", { name: "Find an application", exact: true })
    .fill(company);
  await page.locator(".search-result").first().click();
  await expect(page.locator(".role-title")).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Saved on this device/ }),
  ).toBeVisible();
  const revision = await page.evaluate(async () => {
    const s = await (await fetch("/api/snapshot")).json();
    const r = await fetch("/api/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        expectedRevision: s.view.revision,
        action: "reset",
        payload: {},
      }),
    });
    return (await r.json()).view.revision;
  });
  await expect(page.locator(".app")).toHaveAttribute(
    "data-revision",
    String(revision),
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("opens an application over the scene; Back restores the search and document layers", async ({
  page,
  context,
}) => {
  const initialPages = context.pages().length,
    scene = page.locator(".journey-scene");
  const box = await scene.boundingBox();
  await page.getByRole("button", { name: "Find an application" }).click();
  await page
    .getByRole("textbox", { name: "Find an application", exact: true })
    .fill("Northstar");
  await expect(page.locator(".search-result")).toHaveCount(1);
  await page.locator(".search-result").click();
  await expect(page.getByRole("dialog")).toContainText("Northstar");
  await expect(scene).toHaveCount(1);
  expect(await scene.boundingBox()).toEqual(box);
  await page
    .getByRole("button", { name: "View source", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "This record is fictional",
  );
  expect(context.pages()).toHaveLength(initialPages);
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Application submitted");
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Find an application", exact: true }),
  ).toHaveValue("Northstar");
  await expect(page.locator(".search-result")).toHaveCount(1);
});
test("clicks a journey dot, changes scene without moving the canvas, and closes with Escape", async ({
  page,
}) => {
  const before = await page.locator(".journey-scene").boundingBox();
  await openApplication(page, "Aster Labs");
  await expect(page.getByRole("dialog")).toContainText("Aster Labs");
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "chicago");
  expect(await page.locator(".journey-scene").boundingBox()).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "chicago");
});
test("opens outcome membership in a popup and handles empty offers", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Rejected: 3 applications", exact: true })
    .click();
  await expect(page.locator(".search-result")).toHaveCount(3);
  await page.reload();
  await expect(page.locator(".search-result")).toHaveCount(3);
  await page.getByRole("button", { name: "Close popup" }).click();
  await page
    .getByRole("button", { name: "Offer: 0 applications reached", exact: true })
    .click();
  await expect(page.getByText("No applications here yet")).toBeVisible();
});
test("searches by keyboard, presents readable titles and cleans location markup", async ({
  page,
}) => {
  await page.keyboard.press("/");
  await expect(
    page.getByRole("textbox", { name: "Find an application", exact: true }),
  ).toBeFocused();
  await page.keyboard.type("AI Implementation");
  await expect(page.locator(".search-result")).toHaveCount(7);
  await page.keyboard.press("Enter");
  await expect(page.locator(".role-title")).toHaveText(
    "AI Implementation Engineer",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("respects reduced motion, follows location, and passes popup accessibility checks", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".flow-light")).toHaveCount(0);
  await expect(page.getByLabel("Background", { exact: true })).toBeVisible();
  await openApplication(page, "Northstar");
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "nyc");
  await expect(
    page.getByRole("button", { name: "Back to globe", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Reset view", exact: true }),
  ).toHaveCount(0);
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
});
test("keeps the scene and popup within a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Find an application" }).click();
  await page.locator(".search-result").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("restores the view with an empty browser profile and makes no external requests", async ({
  page,
  browser,
}) => {
  await openApplication(page, "Northstar");
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "nyc");
  await expect(
    page.getByRole("button", { name: "Back to globe", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Reset view", exact: true }),
  ).toHaveCount(0);
  const context = await browser.newContext(),
    fresh = await context.newPage(),
    outside: string[] = [];
  await fresh.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname !== "127.0.0.1") {
      outside.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await fresh.goto("http://127.0.0.1:4399");
  await expect(fresh.locator(".app")).toHaveAttribute("data-theme", "nyc");
  expect(outside).toEqual([]);
  await context.close();
});
test("checks text contrast across all location scenes", async ({ page }) => {
  test.setTimeout(60000); // Eighteen complete Axe scans plus camera transitions.
  for (const scene of sceneIds) {
    await page.evaluate(async (theme) => {
      const state = await (await fetch("/api/snapshot")).json();
      await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          expectedRevision: state.view.revision,
          action: "theme",
          payload: { theme },
        }),
      });
    }, scene);
    await expect(page.locator(".app")).toHaveAttribute("data-theme", scene);
    await expect(page.locator(".scene")).toHaveCount(1);
    await expect(page.locator(".scene")).toHaveAttribute("data-scene", scene);
    await expect(page.locator(".scene")).toHaveCSS("opacity", "1");
    expect(
      (await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze())
        .violations,
      scene,
    ).toEqual([]);
  }
});
test("streams a confirmed source addition into the scene without moving the open application", async ({
  page,
}) => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } =
    await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { Store } = await import("../server/store");
  const { createApp } = await import("../server/app");
  const { demoManifest } = await import("../shared/demo");
  const root = mkdtempSync(join(tmpdir(), "career-flow-live-browser-")),
    store = new Store(join(root, "data")),
    manifest = demoManifest();
  manifest.mode = "private";
  store.importManifest(manifest, root);
  const ledger = join(root, "APPLICATIONS.md");
  mkdirSync(join(root, "receipts"));
  writeFileSync(
    ledger,
    "## Submitted\n| Date | Role | Company | Pay | Location | ATS | Evidence |\n## Still queued\n",
  );
  writeFileSync(
    join(store.dir, "source-watch.json"),
    JSON.stringify({ ledgerPath: ledger, year: 2026, intervalMs: 500 }),
  );
  const server = await createApp(store);
  const url = await server.listen({ host: "127.0.0.1", port: 0 });
  try {
    await page.goto(url);
    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          const s = await (await fetch("/api/snapshot")).json();
          return s.sync.state;
        });
      })
      .toBe("watching");
    await openApplication(page, "Northstar");
    await expect(page.getByRole("dialog")).toContainText("Northstar");
    const previous = await page
      .locator('[data-application="demo-0"] .journey-thread')
      .getAttribute("d");
    writeFileSync(
      join(root, "receipts/new-harbor-confirmation.txt"),
      "New Harbor - AI Engineer\nYour application was successfully submitted.",
    );
    writeFileSync(
      ledger,
      "## Submitted\n| 2026-09-17 | AI Engineer | New Harbor | $180K | Remote | ATS | receipts/new-harbor-confirmation.txt |\n## Still queued\n",
    );
    await expect(page.locator(".application-arrival")).toHaveCount(1);
    await expect(page.locator(".arrival-toast")).toHaveCount(0);
    const particle = page.locator(".arrival-particle");
    await expect(particle).toHaveCount(1);
    const startY = Number(await particle.getAttribute("cy"));
    await expect
      .poll(async () => Number(await particle.getAttribute("cy")))
      .toBeGreaterThan(startY + 10);
    await expect(page.locator(".journey")).toHaveCount(15);
    await expect(page.getByRole("dialog")).toContainText("Northstar");
    expect(
      await page
        .locator('[data-application="demo-0"] .journey-thread')
        .getAttribute("d"),
    ).toBe(previous);
    await expect(page.locator(".application-arrival")).toHaveCount(0, {
      timeout: 6000,
    });
    await expect(page.locator(".new-arrival")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toContainText("Northstar");
  } finally {
    await page.goto("about:blank");
    await server.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("offers only applied locations and never stacks city scenes during rapid changes", async ({
  page,
}) => {
  const options = page.locator("#location-scene option");
  expect(await options.allTextContents()).toEqual([
    "Overview",
    "Remote",
    "Chicago",
    "New York",
  ]);
  const before = await page.locator(".journey-scene").boundingBox();
  await page.evaluate(() => {
    (window as any).sceneOverlap = false;
    const observer = new MutationObserver(() => {
      if (document.querySelectorAll(".scene").length > 1)
        (window as any).sceneOverlap = true;
    });
    observer.observe(document.querySelector(".scenes")!, { childList: true });
  });
  for (const theme of ["nyc", "remote", "chicago", "nyc", "remote"]) {
    await page.getByLabel("Background", { exact: true }).selectOption(theme);
    await expect(page.locator(".app")).toHaveAttribute("data-theme", theme);
  }
  await expect(page.locator(".scene")).toHaveAttribute("data-scene", "remote");
  expect(await page.evaluate(() => (window as any).sceneOverlap)).toBe(false);
  expect(await page.locator(".journey-scene").boundingBox()).toEqual(before);
  await openApplication(page, "Aster Labs");
  await expect(page.locator(".scene")).toHaveAttribute("data-scene", "chicago");
});

test("zooms from the globe toward a city, then pans only the background", async ({
  page,
}) => {
  await expect(page.locator(".earth-globe")).toBeVisible();
  const diagram = await page.locator(".journey-scene").boundingBox();
  const radius = await page
    .locator(".earth-globe > circle")
    .first()
    .getAttribute("r");
  await page.getByLabel("Background", { exact: true }).selectOption("nyc");
  await expect(page.locator(".earth-globe")).toHaveAttribute(
    "data-camera",
    "approach",
  );
  await expect
    .poll(async () =>
      Number(
        await page.locator(".earth-globe > circle").first().getAttribute("r"),
      ),
    )
    .toBeGreaterThan(Number(radius) + 5);
  await expect(page.locator(".scene")).toHaveAttribute("data-scene", "nyc");
  await expect(page.locator(".city-camera")).toBeVisible();
  await expect
    .poll(async () =>
      page
        .locator(".city-camera")
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a),
    )
    .toBeGreaterThan(1.02);
  expect(await page.locator(".journey-scene").boundingBox()).toEqual(diagram);
  await page.getByLabel("Background", { exact: true }).selectOption("remote");
  await expect(page.locator(".earth-globe")).toHaveAttribute(
    "data-camera",
    "orbit",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByLabel("Background", { exact: true }).selectOption("chicago");
  await expect(page.locator(".scene")).toHaveAttribute("data-scene", "chicago");
  expect(
    await page
      .locator(".city-camera")
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a),
  ).toBe(1);
});

test("traces outcomes and stages on hover and keyboard focus without changing the data", async ({
  page,
}) => {
  const rejection = page.getByRole("button", {
    name: "Rejected: 3 applications",
    exact: true,
  });
  await rejection.hover();
  for (const label of await page.locator(".application-label").all()) {
    await expect(label.locator("..")).toHaveCSS("opacity", "1");
    await expect(label).toHaveCSS("font-size", "17px");
  }
  await expect(page.locator(".journey[data-highlighted=true]")).toHaveCount(3);
  await expect(page.locator(".trace-summary")).toContainText(
    "Last confirmed stage",
  );
  await expect(page.locator(".trace-summary")).toContainText(
    "Case / technical: 1",
  );
  await expect(page.locator(".trace-summary")).toContainText(
    "Hiring manager: 1",
  );
  const recruiter = page.getByRole("button", {
    name: "Recruiter: 5 applications reached",
    exact: true,
  });
  await page.mouse.move(5, 5);
  await recruiter.focus();
  await expect(page.locator(".journey[data-highlighted=true]")).toHaveCount(5);
  await expect(page.locator(".trace-summary")).toContainText(
    "3 currently here",
  );
  await expect(page.locator(".trace-summary")).toContainText(
    "2 passed through",
  );
  const northstar = page.getByRole("button", {
    name: /Inspect Juniper Works:/,
  });
  await northstar.focus();
  await expect(page.locator(".journey[data-highlighted=true]")).toHaveCount(1);
  await expect(page.locator(".trace-summary")).toContainText("2026-09-01");
  await northstar.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Juniper Works");
  await expect(page.locator(".journey[data-highlighted=true]")).toHaveCount(1);
  await page.getByRole("button", { name: "Close popup" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Find an application" }).focus();
  await page.mouse.move(5, 5);
  await expect(page.locator(".journey[data-highlighted=true]")).toHaveCount(0);
});

test("aligns globe and rim at different aspect ratios and hides connections at rest", async ({
  page,
}) => {
  await expect(page.locator(".earth-globe")).toBeVisible();
  for (const size of [
    { width: 1512, height: 1100 },
    { width: 1050, height: 1350 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(size);
    const centers = await page.evaluate(() => {
      const diagram = document.querySelector<SVGSVGElement>(".journey-scene")!;
      const earth = document.querySelector<SVGCircleElement>(
        ".earth-globe > circle",
      )!;
      const rim = new DOMPoint(675, 390).matrixTransform(
        diagram.getScreenCTM()!,
      );
      const globe = new DOMPoint(800, 455).matrixTransform(
        earth.getScreenCTM()!,
      );
      return { distance: Math.hypot(rim.x - globe.x, rim.y - globe.y) };
    });
    expect(centers.distance).toBeLessThan(1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page.locator('[data-connection="applied:pending"]'),
  ).toHaveAttribute("data-count", "8");
  await expect(
    page.locator('[data-connection="applied:recruiter"]'),
  ).toHaveAttribute("data-count", "5");
  await expect(page.locator('[data-connection="applied:pending"]')).toHaveCSS(
    "opacity",
    "0",
  );
  await page
    .getByRole("button", {
      name: "Awaiting response: 8 applications",
      exact: true,
    })
    .hover();
  for (const path of await page.locator(".trace-path").all())
    await expect(path).toHaveAttribute("opacity", "0");
});

test("keeps passive groups compact and drills into geographic city markers", async ({
  page,
}) => {
  await expect(page.locator(".earth-globe")).toBeVisible();
  await expect(page.locator(".application-node")).toHaveCount(3);
  for (const link of await page.locator(".connection").all())
    await expect(link).toHaveCSS("opacity", "0");
  const globe = page.getByRole("slider", { name: "Rotate globe" });
  await globe.focus();
  await globe.press("ArrowLeft");
  await globe.press("ArrowLeft");
  await globe.press("ArrowLeft");
  await globe.press("ArrowLeft");
  const nyc = page.getByRole("button", {
    name: "New York: 5 applications",
    exact: true,
  });
  await expect(nyc).toBeVisible();
  await nyc.click();
  await expect(
    page.getByRole("button", { name: "Back to globe", exact: false }),
  ).toBeVisible();
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "nyc");
  await expect(
    page.getByRole("button", { name: "Back to globe", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Reset view", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".journey-viewport")).toHaveAttribute(
    "data-layout",
    "city",
  );
  await expect(page.locator(".status-rim")).toHaveCount(0);
  await expect(page.locator(".city-process-rail")).toHaveAttribute(
    "d",
    "M175 155 H1175",
  );
  const stageY = await page
    .locator(".stage-hub")
    .evaluateAll((nodes) =>
      nodes.map((n) => n.querySelector("circle")!.getAttribute("cy")),
    );
  expect(new Set(stageY).size).toBe(1);
  const outcomeY = await page
    .locator(".outcome-pool")
    .evaluateAll((nodes) =>
      nodes.map((n) => Number(n.querySelector("circle")!.getAttribute("cy"))),
    );
  expect(outcomeY.every((y) => y > Number(stageY[0]))).toBe(true);
  for (const edge of await page.locator(".connection").all())
    await expect(edge).toHaveCSS("opacity", "0");
  await expect(page.locator(".scene")).toHaveAttribute("data-scene", "nyc");
  await expect(page.locator(".earth-globe")).toHaveCount(0);
  await page.setViewportSize({ width: 1512, height: 1100 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".scene")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/city-process-layout.png" });
  await expect(page.locator(".journey")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Explore these applications" })
    .click();
  await expect(page.locator(".search-result")).toHaveCount(5);
  await page.getByRole("button", { name: "Close popup" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".journey")).toHaveCount(5);
  await page.reload();
  await expect(page.locator(".journey")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Back to globe", exact: false })
    .click();
  await expect(page.locator(".journey")).toHaveCount(14);
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "neutral");
  await expect(
    page.getByRole("button", { name: "Back to globe", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Remote · anywhere/ }).click();
  await expect(page.locator(".journey")).toHaveCount(4);
  await expect(page.locator(".journey-viewport")).toHaveAttribute(
    "data-layout",
    "globe",
  );
  await expect(page.locator(".status-rim")).toHaveCount(1);
});
