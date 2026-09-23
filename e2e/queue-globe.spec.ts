import { test, expect, type Page } from "@playwright/test";
async function command(page: Page, action: string, payload: unknown) {
  return page.evaluate(
    async ({ action, payload }) => {
      const state = await (await fetch("/api/career")).json();
      const response = await fetch("/api/career/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          expectedRevision: state.revision,
          action,
          payload,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    { action, payload },
  );
}
async function career(page: Page) {
  return page.evaluate(async () => await (await fetch("/api/career")).json());
}
async function tab(page: Page, name: string) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Outcomes", exact: true }),
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

  await expect(
    page.getByRole("button", { name: "Outcomes", exact: true }),
  ).toBeVisible();
});
test("cleared roles ring their city on the globe and a confirmed submission releases one", async ({
  page,
}, testInfo) => {
  const role = (id: string, title: string) => ({
    id,
    company: "Acme Robotics",
    companyKey: "acmerobotics",
    title,
    jobKey: `acme|${id}`,
    url: `https://jobs.example.com/acme/${id}`,
    description: "Discovered by the board poll.",
    location: "New York, NY",
    compensation: { currency: "USD", annualBase: 190000, annualCash: null },
  });
  await command(page, "opportunities", {
    opportunities: [
      role("ring-a", "Forward Deployed Engineer"),
      role("ring-b", "Solutions Engineer"),
    ],
  });
  const decidedAt = new Date().toISOString();
  for (const [opportunityId, tier] of [
    ["ring-a", "top"],
    ["ring-b", "standard"],
  ])
    await command(page, "triage", {
      opportunityId,
      triage: { tier, score: 80, reason: "Fits the grant.", decidedAt },
    });
  const city = page.locator('.globe-city[aria-label^="New York"]');
  const queuedBefore = Number((await city.getAttribute("data-queued")) ?? 0);
  const queued = (n: number) => String(queuedBefore + n);
  await expect(city).toHaveAttribute("data-queued", queued(2));
  await expect(city).toHaveAttribute(
    "aria-description",
    `${queuedBefore + 2} cleared to apply`,
  );
  await expect(city.locator(".queue-ring")).toBeVisible();
  await expect(city.locator("[data-queue-count]")).toHaveText(
    new RegExp(`${queuedBefore + 2} cleared`),
  );
  await page.screenshot({ path: testInfo.outputPath("queue-ring.png") });
  // A held role stays queued but is no longer cleared.
  await command(page, "decide", { opportunityId: "ring-b", decision: "hold" });
  await expect(city).toHaveAttribute("data-queued", queued(1));
  await command(page, "decide", {
    opportunityId: "ring-b",
    decision: "approved",
  });
  await expect(city).toHaveAttribute("data-queued", queued(2));
  // A receipt-backed submission releases the role from the ring into the count.
  const application = await page.evaluate(async () => {
    const s = await (await fetch("/api/snapshot")).json();
    const template = s.applications[0];
    const submission = template.events.find(
      (e: { kind: string }) => e.kind === "submission",
    );
    return {
      ...template,
      id: "ring-a-app",
      company: "Acme Robotics",
      title: "Forward Deployed Engineer",
      location: "New York, NY",
      theme: "nyc",
      status: "pending",
      submitted: "2026-09-23",
      events: [
        {
          ...submission,
          id: "ring-a-submitted",
          date: "2026-09-23",
          evidenceIds: ["ring-a-receipt"],
        },
      ],
      evidence: [
        {
          id: "ring-a-receipt",
          kind: "receipt",
          label: "ATS receipt",
          text: "Application received",
          basis: "Employer confirmation",
        },
      ],
    };
  });
  const before = Number(
    await city
      .getAttribute("aria-label")
      .then((l) => l!.match(/(\d+) applications/)![1]),
  );
  await command(page, "confirm", { opportunityId: "ring-a", application });
  await expect(
    city.locator('.queue-clear[data-clearing="ring-a"]'),
  ).toHaveCount(1);
  await expect(city).toHaveAttribute("data-queued", queued(1));
  await expect(city).toHaveAttribute(
    "aria-label",
    `New York: ${before + 1} applications`,
  );
  await page.screenshot({ path: testInfo.outputPath("queue-release.png") });
  await expect(city.locator(".queue-clear")).toHaveCount(0, { timeout: 5000 });
});
