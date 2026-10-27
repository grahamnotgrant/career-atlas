import { test, expect } from "@playwright/test";

test("centers the globe in narrow viewports on load and resize without fighting manual panning", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 900, height: 850 });
  await page.goto("/?view=journey");
  await page.evaluate(async () => {
    const s = await (await fetch("/api/snapshot")).json();
    const response = await fetch("/api/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        expectedRevision: s.view.revision,
        action: "reset",
        payload: {},
      }),
    });
    if (!response.ok) throw new Error(await response.text());
  });
  await expect(page.locator(".earth-globe")).toBeVisible();
  const viewport = page.locator(".journey-viewport");
  for (const width of [900, 714, 360, 1050, 650]) {
    await page.setViewportSize({ width, height: 850 });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const viewport = document
              .querySelector(".journey-viewport")!
              .getBoundingClientRect();
            const globe = document
              .querySelector(".earth-globe > circle")!
              .getBoundingClientRect();
            return Math.abs(
              globe.left + globe.width / 2 - viewport.left - viewport.width / 2,
            );
          }),
        {
          message: `globe center should match visible viewport center at ${width}px`,
        },
      )
      .toBeLessThan(1);
  }
  await viewport.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await page.evaluate(async () => {
    const s = await (await fetch("/api/snapshot")).json();
    await fetch("/api/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        expectedRevision: s.view.revision,
        action: "motion",
        payload: { enabled: false },
      }),
    });
  });
  await expect(page.locator(".motion-control button")).toHaveAttribute(
    "aria-label",
    "Resume motion",
  );
  expect(await viewport.evaluate((el) => el.scrollLeft)).toBe(0);
  await page.setViewportSize({ width: 714, height: 850 });
  await expect
    .poll(() => viewport.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  await page.screenshot({
    path: testInfo.outputPath("centered-globe-714.png"),
  });
});
