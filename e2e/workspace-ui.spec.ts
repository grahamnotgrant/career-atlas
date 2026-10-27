import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store";
import { createApp } from "../server/app";
import { demoManifest } from "../shared/demo";

test("work surface preserves decisions, agent delivery, authority and compact reading", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const dir = mkdtempSync(join(tmpdir(), "atlas-workspace-ui-"));
  const store = new Store(dir);
  const manifest = demoManifest();
  manifest.applications[1].evidence.push({
    id: "existing-resume-evidence",
    label: "Existing historical resume reference",
    kind: "resume",
    text: "Synthetic contemporaneous resume reference, separate from the new inventory.",
    basis: "Synthetic existing application evidence",
  });
  store.importManifest(manifest, dir);
  let sequence = 0;
  const career = (action: string, payload: unknown) =>
    store.career.command({
      id: `workspace-ui-career-${++sequence}`,
      expectedRevision: store.career.revision(),
      action,
      payload,
    });
  const workspace = (action: string, payload: unknown) =>
    store.workspace.command({
      id: `workspace-ui-${++sequence}`,
      expectedRevision: store.workspace.revision(),
      actor: "design-agent",
      channel: "agent",
      action,
      payload,
    });
  const now = new Date().toISOString();
  const familyNames = [
    "Interior design",
    "Workplace design",
    "Exhibition design",
    "Spatial planning",
    "Furniture design",
    "Lighting design",
    "Museum design",
    "Retail design",
    "Junior design research",
  ];
  const familyIds = familyNames.map((_, index) =>
    index === 0 ? "interior-design" : `design-role-${index}`,
  );
  const locations = [
    "Chicago",
    ...Array.from(
      { length: 239 },
      (_, index) =>
        `Example workplace district ${index + 1}, fictional state, exact authorized location`,
    ),
  ];
  const exclusions = Array.from(
    { length: 80 },
    (_, index) => `Excluded category ${index + 1}`,
  );
  career("families", {
    families: familyNames.map((name, index) => ({
      id: familyIds[index],
      name,
      rank: index + 1,
      evidence: ["Fictional studio portfolio"],
      rationale: "Project and portfolio evidence",
    })),
  });
  career("grant", {
    grant: {
      id: "design-grant",
      roleFamilyIds: familyIds,
      locations,
      exclusions,
      minAnnualBase: 50000,
      currency: "USD",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      maxApplications: 3,
      approvedAt: now,
      approvalNote: "Fictional bounded design role grant",
    },
  });
  workspace("run", {
    run: {
      id: "portfolio-review",
      operation: "evidence",
      label: "Portfolio review",
      owner: "design-agent",
      status: "running",
      phase: "Clarifying personal design decisions",
      heartbeatAt: new Date(Date.now() - 180000).toISOString(),
      nextAction: "Resolve the contribution question",
    },
  });
  workspace("question", {
    question: {
      id: "design-contribution",
      prompt: "Which part of the studio project did you personally decide?",
      support: [
        {
          label: "Project brief",
          reference: "https://example.com/project-brief",
        },
      ],
      runId: "portfolio-review",
    },
  });
  workspace("question", {
    question: {
      id: "coursework",
      prompt: "Which coursework should we look at next?",
      kind: "choice",
      options: ["Lighting study", "Materials research"],
      runId: "portfolio-review",
    },
  });
  workspace("source", {
    source: {
      id: "portfolio-source",
      label: "Portfolio files",
      kind: "portfolio",
      scope: "Fictional studio project only",
      authorizationRef: "Synthetic fixture approval",
      coverage: "partial",
      checkedAt: now,
      message: "Two project files remain unread",
      recoveryAction: "Read the remaining project brief",
    },
  });
  workspace("fact", {
    fact: {
      id: "studio-contribution",
      label: "Studio renovation",
      observation: "A project brief records the visual direction.",
      contribution: "Set the visual brief and selected materials.",
      ownership: "user-reported",
      outcome: "implemented",
      support: [
        {
          label: "Project brief",
          reference: "https://example.com/project-brief",
        },
      ],
      wording:
        "Set the visual brief and selected materials for a studio renovation.",
    },
  });
  workspace("material", {
    material: {
      id: "design-portfolio",
      applicationId: manifest.applications[0].id,
      attemptKey: "historical-application",
      label: "Studio portfolio",
      role: "portfolio",
      mediaType: "application/pdf",
      reference: "https://example.com/portfolio",
      coverage: "recovery-needed",
      questions: [
        {
          prompt: "What design decision are you proud of?",
          answer: "Balancing daylight with the material palette.",
          status: "answered",
        },
        {
          prompt: "Optional additional context",
          answer: "Prefer not to provide additional context.",
          status: "declined",
        },
        {
          prompt: "Response interrupted during submission",
          answer: "Draft response saved before the form closed.",
          status: "uncaptured",
        },
      ],
    },
  });
  const server = await createApp(store);
  const url = await server.listen({ host: "127.0.0.1", port: 0 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(url);
    await expect(
      page.getByRole("heading", { name: "Your search", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(1);
    const authorityRow = page.locator(".workspace-grant").first();
    await expect(authorityRow.getByRole("heading", { level: 3 })).toHaveText(
      "Interior design, Workplace design +7 more",
    );
    await expect(
      authorityRow.getByText(locations.at(-1)!, { exact: true }),
    ).toBeHidden();
    await authorityRow.getByText("Review exact scope", { exact: true }).click();
    await expect(
      authorityRow.getByRole("heading", {
        name: "Role families (9)",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      authorityRow.getByRole("heading", {
        name: "Locations (240)",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      authorityRow.getByText(locations.at(-1)!, { exact: true }),
    ).toHaveCount(1);
    await expect(
      authorityRow.getByText(exclusions.at(-1)!, { exact: true }),
    ).toHaveCount(1);
    await authorityRow.getByText("Review exact scope", { exact: true }).click();
    await expect(page.locator(".workspace-material-coverage")).toContainText(
      "1 of 14 confirmed applications",
    );
    await expect(page.locator(".workspace-material-coverage")).toContainText(
      "Existing resume evidence: 1 application record",
    );
    await expect(
      page.getByText("Check-in overdue", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Your answer", { exact: true })
      .fill("I set the visual brief and chose the material palette.");
    await page.getByText("Other questions (1)", { exact: true }).click();
    await page
      .getByRole("button", {
        name: "Which coursework should we look at next?",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: "Which part of the studio project did you personally decide?",
        exact: true,
      })
      .click();
    await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
      "I set the visual brief and chose the material palette.",
    );
    await page
      .getByRole("button", { name: "Save answer", exact: true })
      .click();
    await expect
      .poll(
        () =>
          store.workspace
            .snapshot()
            .questions.find((q) => q.id === "design-contribution")?.answer,
      )
      .toBe("I set the visual brief and chose the material palette.");
    expect(store.workspace.snapshot().facts[0].wordingApproval).toBeNull();
    expect(store.career.snapshot().grants[0].state).toBe("active");

    let dropped = false;
    const steeringIds: string[] = [];
    await page.route("**/api/workspace/commands", async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === "steer") {
        steeringIds.push(body.id);
        if (!dropped) {
          dropped = true;
          const response = await route.fetch();
          expect(response.ok()).toBe(true);
          await route.abort();
          return;
        }
      }
      await route.continue();
    });
    await page
      .getByLabel("What should happen next?", { exact: true })
      .fill("Prioritize junior studio roles with portfolio-based interviews.");
    await page
      .getByRole("button", { name: "Save instruction", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Check saved change", exact: true }),
    ).toBeVisible();
    expect(store.workspace.snapshot().steering).toHaveLength(1);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Check saved change", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("What should happen next?", { exact: true })
      .fill(
        "Preserve this new instruction draft while checking the previous change.",
      );
    await page
      .getByRole("button", { name: "Check saved change", exact: true })
      .click();
    await expect(
      page.getByText("The saved change is confirmed.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("What should happen next?", { exact: true }),
    ).toHaveValue(
      "Preserve this new instruction draft while checking the previous change.",
    );
    expect(steeringIds).toHaveLength(2);
    expect(new Set(steeringIds).size).toBe(1);
    expect(store.workspace.snapshot().steering).toHaveLength(1);
    expect(store.workspace.snapshot().steering[0].status).toBe("pending");
    await page.getByLabel("What should happen next?", { exact: true }).fill("");
    await expect(
      page.getByText("Waiting for agent pickup", { exact: true }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Pause applications", exact: true })
      .click();
    await expect
      .poll(() => store.career.snapshot().grants[0].state)
      .toBe("paused");
    await page.getByText("Work evidence (1)", { exact: true }).click();
    await page
      .getByRole("button", { name: "Approve this wording", exact: true })
      .click();
    await expect
      .poll(() => store.workspace.snapshot().facts[0].wordingApproval?.text)
      .toBe(
        "Set the visual brief and selected materials for a studio renovation.",
      );
    expect(store.career.snapshot().grants[0].state).toBe("paused");
    await page.getByText("Application materials (1)", { exact: true }).click();
    await page
      .getByText("Exact questions and answers (3)", { exact: true })
      .click();
    await expect(
      page.getByText("Balancing daylight with the material palette.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("declined", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Prefer not to provide additional context.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("uncaptured", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Draft response saved before the form closed.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByText("Search preferences", { exact: true }).click();

    await page
      .getByLabel("What should happen next?", { exact: true })
      .fill("Preserve this draft while I explore the journey.");
    await page
      .getByLabel("Direct this work", { exact: true })
      .selectOption("portfolio-review");
    await page
      .getByRole("button", { name: "Explore the journey", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your search", exact: true }),
    ).toBeHidden();
    await page.getByRole("button", { name: "Work", exact: true }).click();
    await expect(
      page.getByLabel("What should happen next?", { exact: true }),
    ).toHaveValue("Preserve this draft while I explore the journey.");
    await page.getByRole("button", { name: /^Role families/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Unmatched", exact: true })
      .click();
    await expect(page.locator("#scene-workspace")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your search", exact: true }),
    ).toBeHidden();
    await page.getByRole("button", { name: "Work", exact: true }).click();
    await expect(
      page.getByLabel("What should happen next?", { exact: true }),
    ).toHaveValue("Preserve this draft while I explore the journey.");
    workspace("run", {
      run: {
        id: "portfolio-review",
        operation: "evidence",
        label: "Portfolio review",
        owner: "design-agent",
        status: "complete",
        phase: "Portfolio review complete",
      },
    });
    await expect(
      page.getByText(
        "The selected work is no longer active. Review and choose a target before saving this instruction.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByLabel("Direct this work", { exact: true }),
    ).toHaveValue("portfolio-review");
    await expect(
      page.getByRole("button", { name: "Save instruction", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Direct this work", { exact: true }).selectOption("");
    await expect(
      page.getByRole("button", { name: "Save instruction", exact: true }),
    ).toBeEnabled();
    await page.getByLabel("What should happen next?", { exact: true }).fill("");
    await page
      .getByLabel("What you want next", { exact: true })
      .fill("Junior studio design roles");
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await expect
      .poll(() => store.career.snapshot().settings.goals)
      .toBe("Junior studio design roles");
    await expect(
      page.getByRole("button", { name: "Save preferences", exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel("What you want next", { exact: true })
      .fill("Interior design roles with mentorship");
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await expect
      .poll(() => store.career.snapshot().settings.goals)
      .toBe("Interior design roles with mentorship");
    await page.getByText("Search preferences", { exact: true }).click();

    for (const width of [714, 900, 360, 1440]) {
      await page.setViewportSize({ width, height: 640 });
      const rowHeight = await authorityRow.evaluate(
        (row) => row.getBoundingClientRect().height,
      );
      expect(
        rowHeight,
        `collapsed authorization row at ${width}px must not expand to its hundreds of scope strings`,
      ).toBeLessThan(600);
      await expect(
        authorityRow.getByText(locations.at(-1)!, { exact: true }),
      ).toBeHidden();
      await page
        .getByRole("heading", { name: "Your search", exact: true })
        .scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      const collisions = await page
        .locator(".workspace-screen")
        .evaluate((root) =>
          [
            ...root.querySelectorAll<HTMLElement>(
              "button,textarea,select,input",
            ),
          ]
            .filter(
              (el) =>
                el.getBoundingClientRect().width &&
                el.getBoundingClientRect().height,
            )
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.left < -1 || r.right > innerWidth + 1;
            })
            .map((el) => el.textContent || el.id),
        );
      expect(collisions).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`workspace-${width}.png`),
        fullPage: false,
      });
    }
    await page.setViewportSize({ width: 714, height: 640 });
    const accessibility = await new AxeBuilder({ page })
      .include(".workspace-screen")
      .analyze();
    expect(accessibility.violations).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank").catch(() => {});
    await server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
