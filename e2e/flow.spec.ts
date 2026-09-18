import { sceneIds } from "../shared/locations";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function setTheme(page: Page, theme: string) {
  await page.evaluate(async (theme) => {
    const s = await (await fetch("/api/snapshot")).json();
    const response = await fetch("/api/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        expectedRevision: s.view.revision,
        action: "theme",
        payload: { theme },
      }),
    });
    if (!response.ok) throw new Error(await response.text());
  }, theme);
  await expect(page.locator(".app")).toHaveAttribute("data-theme", theme);
}
async function setCity(page: Page, city: string | null) {
  await page.evaluate(async (city) => {
    const s = await (await fetch("/api/snapshot")).json();
    const response = await fetch("/api/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        expectedRevision: s.view.revision,
        action: "location",
        payload: { city },
      }),
    });
    if (!response.ok) throw new Error(await response.text());
  }, city);
  await expect(page.locator(".app")).toHaveAttribute(
    "data-theme",
    city ?? "neutral",
  );
}
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
    page.getByRole("button", { name: "Find an application" }),
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
test("selects an outcome to list its members and says when a stage is empty", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Rejected: 3 applications", exact: true })
    .click();
  const panel = page.locator(".stage-panel");
  await expect(panel.locator("h2")).toHaveText("Rejected");
  await expect(panel).toContainText("3 applications");
  await expect(panel).toContainText("Last confirmed stage");
  await expect(panel.locator(".stage-companies button")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Offer: 0 applications reached", exact: true })
    .click();
  await expect(panel.locator("h2")).toHaveText("Offer");
  await expect(panel).toContainText("No applications here yet");
  await page.reload();
  await expect(panel.locator("h2")).toHaveText("Offer");
  await page.getByRole("button", { name: "Back to overview" }).click();
  await expect(panel).toHaveCount(0);
  await page.reload();
  await expect(panel).toHaveCount(0);
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
  await openApplication(page, "Northstar");
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "nyc");
  await expect(
    page.getByRole("button", { name: "Back to globe", exact: true }),
  ).toHaveCount(1);
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
test("queues a confirmed source addition until the scene is visible", async ({
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
    await expect(
      page.getByText("15 confirmed applications", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Watch 1 new application" }),
    ).toBeVisible();
    await expect(page.locator(".application-arrival")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toContainText("Northstar");
    expect(
      await page
        .locator('[data-application="demo-0"] .journey-thread')
        .getAttribute("d"),
    ).toBe(previous);
    // Reload during the open detail view must preserve the unseen arrival.
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Watch 1 new application" }),
    ).toBeVisible();
    await expect(page.locator(".application-arrival")).toHaveCount(0);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close popup", exact: true })
      .click();
    await page.getByRole("button", { name: "Watch 1 new application" }).click();
    await expect(page.locator(".application-arrival")).toHaveCount(1);
    const particle = page.locator(".arrival-particle");
    const startY = Number(await particle.getAttribute("cy"));
    await expect
      .poll(async () => Number(await particle.getAttribute("cy")))
      .toBeGreaterThan(startY + 10);
    await expect(page.locator(".application-arrival")).toHaveCount(0, {
      timeout: 6000,
    });
  } finally {
    await page.goto("about:blank");
    await server.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("never stacks city scenes during rapid changes", async ({ page }) => {
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
    await setTheme(page, theme);
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
  await setTheme(page, "nyc");
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
  await setTheme(page, "remote");
  await expect(page.locator(".earth-globe")).toHaveAttribute(
    "data-camera",
    "orbit",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setTheme(page, "chicago");
  await expect(page.locator(".scene")).toHaveAttribute("data-scene", "chicago");
  expect(
    await page
      .locator(".city-camera")
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a),
  ).toBe(1);
});

test("selects outcomes and stages by pointer and keyboard without changing the data", async ({
  page,
}) => {
  // The orb's count follows the selection, so match it by name only.
  const rejection = page.getByRole("button", { name: /^Rejected: / });
  await rejection.click();
  const panel = page.locator(".stage-panel");
  await expect(panel.locator("h2")).toHaveText("Rejected");
  await expect(panel.locator(".stage-next dt")).toContainText([
    "Case / technical",
    "Hiring manager",
  ]);
  await expect(rejection).toHaveAttribute("aria-pressed", "true");
  const recruiter = page.getByRole("button", {
    name: "Recruiter: 5 applications reached",
    exact: true,
  });
  await recruiter.focus();
  await page.keyboard.press("Enter");
  await expect(rejection).toHaveAttribute("aria-pressed", "false");
  await expect(recruiter).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".journey[data-highlighted=true]")).toHaveCount(3);
  await expect(panel).toContainText("Currently here · 3");
  await expect(panel.locator(".stage-history summary")).toHaveText(
    "Past applications · 2",
  );
  await expect(page.locator(".application-node")).toHaveCount(0);
  await panel.getByRole("button", { name: /Inspect Juniper Works:/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Juniper Works");
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".journey[data-highlighted=true]")).toHaveCount(1);
  await page.getByRole("button", { name: "Close popup" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(panel.locator("h2")).toHaveText("Recruiter");
  await recruiter.click();
  await expect(panel).toHaveCount(0);
  await expect(recruiter).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".journey[data-highlighted=true]")).toHaveCount(0);
});

test("aligns globe and rim at different aspect ratios and draws ribbons only for a selection", async ({
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
  await expect(page.locator(".connection")).toHaveCount(0);
  await expect(page.locator(".city-ribbon:visible")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Applied: 14 applications reached",
      exact: true,
    })
    .click();
  await expect(page.locator(".connection")).toHaveCount(0);
  const nyc = page.locator('.city-ribbon[data-ribbon="nyc"]');
  await expect(nyc).toBeVisible();
  await expect(nyc).toHaveAttribute("data-count", /^[1-9]/);
  const count = await nyc.getAttribute("data-count");
  await expect(
    page.locator('.globe-city[aria-label^="New York"] text').first(),
  ).toHaveText(count!);
  await expect(
    page.locator('.city-ribbon[data-ribbon="remote"]'),
  ).toBeVisible();
  await expect(
    page.locator(".city-ribbon .ribbon-body").first(),
  ).toHaveAttribute("d", /^M[\d. -]+ Q[\d. -]+ [\d. -]+$/);
  await page
    .getByRole("button", {
      name: "Awaiting response: 8 applications",
      exact: true,
    })
    .click();
  for (const path of await page.locator(".trace-path").all())
    await expect(path).toHaveAttribute("opacity", "0");
});

test("keeps passive groups compact and drills into geographic city markers", async ({
  page,
}) => {
  await expect(page.locator(".earth-globe")).toBeVisible();
  await expect(page.locator(".application-node")).toHaveCount(0);
  await expect(page.locator(".connection")).toHaveCount(0);
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
  await expect(page.locator(".connection")).toHaveCount(0);
  await expect(page.locator(".scene")).toHaveAttribute("data-scene", "nyc");
  await expect(page.locator(".earth-globe")).toHaveCount(0);
  await page.setViewportSize({ width: 1512, height: 1100 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".scene")).toHaveCSS("opacity", "1");
  await expect(page.locator(".geography-controls")).toContainText(
    "New York · 5 applications",
  );
  await page
    .getByRole("button", { name: "Explore these applications" })
    .click();
  await expect(page.locator(".search-result")).toHaveCount(5);
  await page.getByRole("button", { name: "Close popup" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".geography-controls")).toContainText(
    "New York · 5 applications",
  );
  await page.reload();
  await expect(page.locator(".geography-controls")).toContainText(
    "New York · 5 applications",
  );
  await page
    .getByRole("button", { name: "Back to globe", exact: false })
    .click();
  await expect(
    page.getByText("14 confirmed applications", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "neutral");
  await expect(
    page.getByRole("button", { name: "Back to globe", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Remote · anywhere/ }).click();
  await expect(page.locator(".geography-controls")).toContainText(
    "Remote · 4 applications",
  );
  await expect(page.locator(".journey-viewport")).toHaveAttribute(
    "data-layout",
    "globe",
  );
  await expect(page.locator(".status-rim")).toHaveCount(1);
});
test("a selected stage lists who is there now, keeps the past collapsed, and opens companies", async ({
  page,
}) => {
  await expect(page.locator(".application-node")).toHaveCount(0);
  await expect(page.locator(".stage-companies button")).toHaveCount(0);
  const recruiter = page.getByRole("button", {
    name: "Recruiter: 5 applications reached",
    exact: true,
  });
  await expect(recruiter.locator("text").first()).toHaveText("5");
  await recruiter.click();
  const panel = page.locator(".stage-panel");
  await expect(panel).toContainText("Currently here · 3");
  await expect(panel).toContainText("5 reached in total");
  await expect(page.locator('.stage-drop[data-drop="pending"]')).toHaveCount(3);
  await expect(page.locator('.stage-drop[data-drop="rejected"]')).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Awaiting response: 3 applications" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rejected: 0 applications" }),
  ).toHaveCSS("opacity", "0.2");
  await expect(
    panel.locator(".stage-current .stage-companies button"),
  ).toHaveCount(3);
  await expect(panel.locator(".stage-current")).not.toContainText("Rejected");
  const history = panel.locator(".stage-history");
  await expect(history.locator("summary")).toHaveText("Past applications · 2");
  await expect(history).not.toHaveAttribute("open", "");
  await history.locator("summary").click();
  await expect(history).toContainText("Rejected");
  const northstar = panel.getByRole("button", { name: /Inspect Northstar:/ });
  await northstar.hover();
  await expect(page.locator('[data-emphasis="on"]').first()).toBeAttached();
  await page.mouse.move(5, 5);
  await expect(page.locator("[data-emphasis]")).toHaveCount(0);
  await northstar.click();
  await expect(page.getByRole("dialog")).toContainText("Northstar");
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Close popup", exact: true }).click();
  await expect(panel.locator("h2")).toHaveText("Recruiter");
  await page
    .getByRole("button", { name: /^Hiring manager: .* applications reached$/ })
    .click();
  const ended = panel.locator(".stage-next div", {
    hasText: "Ended at this stage",
  });
  await expect(ended.locator("dd")).toHaveText("1");
  await expect(page.locator('.stage-drop[data-drop="rejected"]')).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("button", { name: "Rejected: 1 applications" }),
  ).toHaveCSS("opacity", "1");
  await expect(panel).toContainText("No applications are at this stage now");
});

test("the panel keeps the globe its size and clear of it, and docks on narrow screens", async ({
  page,
}) => {
  const globe = page.locator('circle[fill="url(#earth-ocean)"]');
  for (const width of [1600, 900]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ["Applied", "Recruiter", "Offer"]) {
      const hub = page.getByRole("button", {
        name: new RegExp(`^${name}: .* applications reached$`),
      });
      await hub.scrollIntoViewIfNeeded();
      const before = await globe.boundingBox();
      await hub.click();
      const panel = page.locator(".stage-panel");
      await expect(panel).toBeVisible();
      await expect(panel.locator("h2")).toHaveText(name);
      const after = await globe.boundingBox();
      expect(after!.width).toBeCloseTo(before!.width, 3);
      expect(after!.height).toBeCloseTo(before!.height, 3);
      const box = await panel.boundingBox();
      expect(
        box!.x + box!.width <= after!.x ||
          box!.x >= after!.x + after!.width ||
          box!.y >= after!.y + after!.height,
      ).toBe(true);
      if (width === 1600)
        for (const control of await page
          .locator(".stage-hub, .rim-outcome, .remote-satellite")
          .all()) {
          const controlBox = await control.boundingBox();
          expect(controlBox).not.toBeNull();
          expect(
            box!.x + box!.width <= controlBox!.x ||
              box!.x >= controlBox!.x + controlBox!.width ||
              box!.y + box!.height <= controlBox!.y ||
              box!.y >= controlBox!.y + controlBox!.height,
          ).toBe(true);
        }
      else await expect(panel).toHaveCSS("position", "fixed");
      await hub.click();
      await expect(panel).toHaveCount(0);
    }
  }
});

test("city scenes scope the same way as the globe, and motion stops under reduced motion", async ({
  page,
}) => {
  const applied = page.getByRole("button", {
    name: /^Applied: .* applications reached$/,
  });
  await applied.click();
  await expect(page.locator(".ribbon-light").first()).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".flow-light")).toHaveCount(0);
  await expect(page.locator(".city-ribbon .ribbon-body").first()).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await applied.click();
  await setCity(page, "nyc");
  await expect(page.locator(".connection")).toHaveCount(0);
  await page
    .getByRole("button", { name: /^Recruiter: .* applications reached$/ })
    .click();
  await expect(page.locator(".stage-panel h2")).toHaveText("Recruiter");
  await expect(page.locator(".city-ribbon")).toHaveCount(0);
  await expect(page.locator(".connection")).toHaveCount(0);
  await expect(page.locator('.stage-drop[data-drop="pending"]')).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Awaiting response: 1 applications" }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".stage-drop")).toHaveCount(0);
  await expect(page.locator(".stage-panel h2")).toHaveText("Recruiter");
});

test("a selection lights the places holding it, fades the rest, and clears cleanly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  const related = page.locator('.globe-city[data-relevance="related"]');
  const unrelated = page.locator('.globe-city[data-relevance="unrelated"]');
  const satellite = page.locator(".remote-satellite");
  await page
    .getByRole("button", {
      name: "Recruiter: 5 applications reached",
      exact: true,
    })
    .click();
  await expect(related).toHaveCount(2);
  await expect(unrelated).toHaveCount(0);
  await expect(satellite).toHaveAttribute("data-relevance", "related");
  await expect(satellite.locator(".satellite-count")).toHaveText("1");
  await page
    .getByRole("button", {
      name: "Case / technical: 1 applications reached",
      exact: true,
    })
    .click();
  await expect(related).toHaveCount(0);
  await expect(unrelated).toHaveCount(2);
  await expect(unrelated.first()).toHaveCSS("opacity", "0.2");
  await expect(satellite).toHaveAttribute("data-relevance", "unrelated");
  await expect(page.locator(".stage-panel")).toContainText(
    "No applications are at this stage now",
  );
  await page.getByRole("button", { name: "Back to overview" }).click();
  await expect(page.locator('.globe-city[data-relevance="all"]')).toHaveCount(
    2,
  );
  await expect(satellite).toHaveAttribute("data-relevance", "all");
  await expect(satellite.locator(".satellite-count")).toHaveText("4");
  await expect(page.locator(".connection")).toHaveCount(0);
});

test("initial scene loads through one stream without a duplicate snapshot download", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) requests.push(path);
  });
  await page.goto("/");
  await expect(page.locator(".earth-globe")).toBeVisible();
  await expect(page.locator(".stage-hub")).toHaveCount(5);
  expect(requests.filter((path) => path === "/api/events")).toHaveLength(1);
  expect(requests.filter((path) => path === "/api/snapshot")).toHaveLength(0);
});

test("shows what landed since the last visit, with the cadence strip, and dismisses it", async ({
  page,
}) => {
  await expect(page.locator(".cadence")).toBeVisible();
  await expect(page.locator(".digest")).toHaveCount(0);
  const workspaceId = await page.evaluate(
    async () => (await (await fetch("/api/snapshot")).json()).workspaceId,
  );
  // Leaving a page with nothing pending moves the baseline to today, so plant
  // the earlier visit after that write and before the app reads it.
  await page.addInitScript(
    (key) => localStorage.setItem(key, "2026-08-01"),
    `career-atlas.looked.v1.${workspaceId}`,
  );
  await page.reload();
  const digest = page.locator(".digest");
  await expect(digest).toContainText("interview");
  await digest.getByRole("button", { name: /^Since/ }).click();
  await expect(page.locator(".search-result").first()).toBeVisible();
  await page.getByRole("button", { name: "Close popup" }).click();
  await digest.getByRole("button", { name: "Dismiss digest" }).click();
  await expect(digest).toHaveCount(0);
  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    `career-atlas.looked.v1.${workspaceId}`,
  );
  expect(stored).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(stored).not.toBe("2026-08-01");
});
