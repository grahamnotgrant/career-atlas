import { test, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app";
import { Store } from "../server/store";
import { demoManifest } from "../shared/demo";
import { opportunitySchema } from "../shared/career";

test("footer reflows all status controls without collisions in embedded and narrow views", async ({
  page,
}, testInfo) => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-footer-"));
  const store = new Store(dir);
  const manifest = demoManifest();
  const day = new Date().toISOString().slice(0, 10);
  for (const app of manifest.applications) {
    app.submitted = day;
    app.asOf = day;
    for (const event of app.events) event.date = day;
  }
  for (const [index, status] of [
    [0, "offer"],
    [1, "closed"],
  ] as const) {
    const app = manifest.applications[index];
    app.status = status;
    app.events.push({
      id: `${app.id}-footer-decision`,
      date: day,
      kind: "decision",
      stage: status === "offer" ? "offer" : null,
      label: status === "offer" ? "Offer received" : "Role closed",
      detail: "Synthetic footer fixture",
      evidenceIds: [app.evidence[0].id],
    });
  }
  store.importManifest(manifest, dir);
  store.career.command({
    id: "footer-opportunities",
    expectedRevision: store.career.revision(),
    action: "opportunities",
    payload: {
      opportunities: Array.from({ length: 84 }, (_, i) =>
        opportunitySchema.parse({
          id: `footer-uncertain-${i}`,
          company: `Example Employer ${i}`,
          companyKey: `example${i}`,
          title: "Design Assistant",
          jobKey: `footer-job-${i}`,
          url: "",
          description: "Synthetic role for layout verification",
          location: "Remote",
          lifecycle: "uncertain",
          provenance: [
            {
              id: `footer-source-${i}`,
              kind: "source",
              text: "Synthetic interrupted attempt",
              source: "layout fixture",
              recordedAt: new Date().toISOString(),
            },
          ],
        }),
      ),
    },
  });
  store.db
    .prepare(
      "INSERT INTO metadata VALUES ('sync',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(
      JSON.stringify({
        enabled: true,
        state: "error",
        checkedAt: new Date().toISOString(),
        added: 0,
        message: "Synthetic source unavailable",
      }),
    );
  store.command({
    id: "footer-pause-motion",
    expectedRevision: store.snapshot().view.revision,
    action: "motion",
    payload: { enabled: false },
  });
  const workspaceId = store.snapshot().workspaceId!;
  await page.addInitScript((id) => {
    localStorage.setItem(`career-atlas.looked.v1.${id}`, "2000-01-01");
    localStorage.setItem(
      `career-atlas.arrivals.v1.${id}`,
      JSON.stringify({
        version: 1,
        known: [],
        pending: [],
      }),
    );
  }, workspaceId);
  const server = await createApp(store);
  const url = await server.listen({ host: "127.0.0.1", port: 0 });
  try {
    await page.goto(`${url}/?view=journey`);
    await expect(page.locator(".digest")).toContainText("offer");
    await expect(page.locator(".digest")).toContainText("closed");
    await expect(
      page.getByRole("button", { name: "84 uncertain" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Watch .* new/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Source needs attention" }),
    ).toBeVisible();
    for (const width of [714, 900, 360, 1440]) {
      await page.setViewportSize({ width, height: 640 });
      const footer = page.locator(".scene-bottom");
      await footer.scrollIntoViewIfNeeded();
      await expect
        .poll(
          async () =>
            footer.evaluate((root) => {
              const outer = root.getBoundingClientRect();
              const nodes = [
                ...root.querySelectorAll<HTMLElement>(
                  ".round-button, .motion-control strong, .motion-control > div > span, .cadence > svg, .cadence figcaption, .scene-status > button, .digest > button",
                ),
              ]
                .map((node) => ({
                  label:
                    node.getAttribute("aria-label") ||
                    node.textContent?.trim() ||
                    node.tagName,
                  rect: node.getBoundingClientRect(),
                  overflow:
                    node.scrollWidth > node.clientWidth + 1 &&
                    node.clientWidth > 0,
                }))
                .filter((node) => node.rect.width && node.rect.height);
              const issues: string[] = [];
              for (const node of nodes) {
                if (
                  node.rect.left < outer.left - 1 ||
                  node.rect.right > outer.right + 1 ||
                  node.rect.top < outer.top - 1 ||
                  node.rect.bottom > outer.bottom + 1
                )
                  issues.push(`outside footer: ${node.label}`);
                if (node.overflow) issues.push(`clipped text: ${node.label}`);
              }
              for (let i = 0; i < nodes.length; i++) {
                for (const other of nodes.slice(i + 1)) {
                  const a = nodes[i].rect,
                    b = other.rect;
                  if (
                    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
                    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
                  )
                    issues.push(`overlap: ${nodes[i].label} / ${other.label}`);
                }
              }
              return issues;
            }),
          {
            message: `footer controls at ${width}px must remain separated and readable`,
          },
        )
        .toEqual([]);
      await footer.screenshot({
        path: testInfo.outputPath(`footer-${width}.png`),
      });
    }
  } finally {
    await page.goto("about:blank");
    await server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
