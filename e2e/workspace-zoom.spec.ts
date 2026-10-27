import { test, expect, type Locator } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app";
import { Store } from "../server/store";
import { demoManifest } from "../shared/demo";

test("Work controls remain operable at 200% rendered CSS zoom in a 900px panel", async ({
  page,
}, testInfo) => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-workspace-zoom-"));
  const store = new Store(dir);
  store.importManifest(demoManifest(), dir);
  store.workspace.command({
    id: "zoom-question",
    expectedRevision: store.workspace.revision(),
    actor: "zoom-review-agent",
    channel: "agent",
    action: "question",
    payload: {
      question: {
        id: "portfolio-decision",
        prompt: "Which portfolio decision did you personally make?",
      },
    },
  });
  const server = await createApp(store);
  const url = await server.listen({ host: "127.0.0.1", port: 0 });
  const expectWithinWidth = async (control: Locator) => {
    await control.scrollIntoViewIfNeeded();
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(-1);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(901);
  };
  const expectNoHorizontalOverflow = async () => {
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 1);
  };
  try {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto(url);
    const answer = page.getByLabel("Your answer", { exact: true });
    await expect(answer).toBeVisible();
    const originalHeight = (await answer.boundingBox())!.height;
    // CSS rendered zoom doubles fixed-pixel text and controls too; changing
    // the root font size alone would leave most of this interface unchanged.
    await page.evaluate(() => {
      document.documentElement.style.zoom = "200%";
    });
    await expect
      .poll(async () => (await answer.boundingBox())!.height)
      .toBeGreaterThan(originalHeight * 1.8);
    await expectNoHorizontalOverflow();
    const navigation = page.getByRole("navigation", {
      name: "Search workspace",
    });
    for (const control of await navigation.getByRole("button").all())
      await expectWithinWidth(control);

    const queue = navigation.getByRole("button", { name: /^Role queue/ });
    await queue.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole("button", { name: "Close popup" });
    await expectWithinWidth(close);
    await expectNoHorizontalOverflow();
    await close.click();
    await expect(dialog).toHaveCount(0);

    await expectWithinWidth(answer);
    await answer.fill("I selected the synthetic project material palette.");
    const saveAnswer = page.getByRole("button", {
      name: "Save answer",
      exact: true,
    });
    await expectWithinWidth(saveAnswer);
    await saveAnswer.click();
    await expect
      .poll(() => store.workspace.snapshot().questions[0].answer)
      .toBe("I selected the synthetic project material palette.");

    const instruction = page.getByLabel("What should happen next?", {
      exact: true,
    });
    await expectWithinWidth(instruction);
    await instruction.fill("Review the remaining synthetic portfolio files.");
    const saveInstruction = page.getByRole("button", {
      name: "Save instruction",
      exact: true,
    });
    await expectWithinWidth(saveInstruction);
    await saveInstruction.click();
    await expect
      .poll(() => store.workspace.snapshot().steering[0]?.instruction)
      .toBe("Review the remaining synthetic portfolio files.");
    await expectNoHorizontalOverflow();
    await page.screenshot({
      path: testInfo.outputPath("workspace-css-zoom-200.png"),
      fullPage: false,
    });
  } finally {
    await page.goto("about:blank").catch(() => {});
    await server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
