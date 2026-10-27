import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store";
import { createApp } from "../server/app";
import { demoManifest } from "../shared/demo";

for (const hasQuestion of [true, false]) {
  test(`dark decision surface keeps ${hasQuestion ? "pending question" : "empty state"} readable`, async ({
    page,
  }, testInfo) => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-workspace-theme-"));
    const store = new Store(dir);
    store.importManifest(demoManifest(), dir);
    if (hasQuestion)
      store.workspace.command({
        id: "theme-question",
        expectedRevision: store.workspace.revision(),
        actor: "theme-review-agent",
        channel: "agent",
        action: "question",
        payload: {
          question: {
            id: "portfolio-decision",
            prompt:
              "Which part of this portfolio project did you personally decide?",
            support: [
              {
                label: "Synthetic project brief",
                reference: "https://example.com/project-brief",
              },
            ],
          },
        },
      });
    const server = await createApp(store);
    const url = await server.listen({ host: "127.0.0.1", port: 0 });
    try {
      await page.goto(url);
      const card = page.locator(".workspace-next");
      await expect(card).toHaveAttribute(
        "data-has-question",
        String(hasQuestion),
      );
      if (hasQuestion) {
        await page
          .getByLabel("Your answer", { exact: true })
          .fill("I selected the synthetic project material palette.");
        await expect(
          card.getByRole("button", { name: "Save answer", exact: true }),
        ).toBeEnabled();
      } else {
        await expect(
          card.getByRole("button", { name: "Review role queue", exact: true }),
        ).toHaveClass("workspace-secondary");
      }
      for (const width of [360, 714]) {
        await page.setViewportSize({ width, height: 640 });
        await card.evaluate((element) =>
          element.scrollIntoView({ block: "start" }),
        );
        await expect(card).toHaveCSS(
          "background-color",
          hasQuestion ? "rgb(16, 36, 58)" : "rgb(11, 25, 43)",
        );
        const accessibility = await new AxeBuilder({ page })
          .include(".workspace-next")
          .withRules(["color-contrast"])
          .analyze();
        expect(accessibility.violations).toEqual([]);
        await page.screenshot({
          path: testInfo.outputPath(
            `decision-${hasQuestion ? "question" : "empty"}-${width}.png`,
          ),
          fullPage: false,
        });
      }
    } finally {
      await page.goto("about:blank").catch(() => {});
      await server.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
