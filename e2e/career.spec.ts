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
test("creates evidence-backed family, classifies confirmed record, and filters role journeys", async ({
  page,
}) => {
  const existing = (await career(page)).families;
  await command(page, "families", {
    families: [
      ...existing,
      {
        id: crypto.randomUUID(),
        name: "Implementation QA",
        rank: existing.length + 1,
        evidence: ["Built a tested integration"],
        rationale: "Implements systems",
      },
    ],
  });
  await page.getByRole("button", { name: "Top roles", exact: true }).click();
  await expect
    .poll(async () =>
      (await career(page)).families.some(
        (f: any) => f.name === "Implementation QA",
      ),
    )
    .toBe(true);
  await tab(page, "All records");
  await page.getByLabel("Search records").fill("Northstar");
  await page.locator(".record-row").first().click();
  await page
    .getByRole("combobox", { name: "Role family", exact: true })
    .selectOption({ label: "Implementation QA" });
  await expect
    .poll(
      async () =>
        (await career(page)).opportunities.find(
          (o: any) => o.company === "Northstar",
        )?.roleFamilyId,
    )
    .toBeTruthy();
  await tab(page, "Top roles");
  await page
    .getByRole("button", { name: "Implementation QA", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Applied: 1 applications reached",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".selected-role")).toContainText(
    "Implementation QA",
  );
  await page.getByRole("button", { name: "Find an application" }).click();
  await expect(page.locator(".search-result")).toHaveCount(1);
  await expect(page.locator(".search-result")).toContainText("Northstar");
});
test("company history retains distinct roles", async ({ page }) => {
  await command(page, "opportunities", {
    opportunities: [
      {
        id: "ui-company-one",
        company: "History Fixture",
        companyKey: "history-fixture",
        title: "Role One",
        jobKey: "ui-company-one",
        url: "",
        description: "First description",
        location: "Remote",
      },
      {
        id: "ui-company-two",
        company: "History Fixture",
        companyKey: "history-fixture",
        title: "Role Two",
        jobKey: "ui-company-two",
        url: "",
        description: "Second description",
        location: "Remote",
      },
    ],
  });
  await page.getByRole("button", { name: "All records", exact: true }).click();
  await tab(page, "Companies");
  await page.getByLabel("Search records").fill("History Fixture");
  await page
    .getByText("History Fixture · 2 roles · 0 applied", { exact: true })
    .click();
  await expect(page.locator(".company-history .record-row")).toHaveCount(2);
});
test("offer terms preserve sources and do not invent a recruiting stage", async ({
  page,
}) => {
  const state = await career(page);
  const pending = state.opportunities.find(
    (o: any) => o.applicationId === "demo-6",
  );
  await command(page, "annotate", {
    opportunityId: pending.id,
    offer: {
      currency: "USD",
      base: 180000,
      bonus: 10000,
      equity: "Proposed equity; not a confirmed offer",
      location: "Remote",
      deadline: null,
      decision: "pending",
    },
    provenance: [
      {
        id: "terms-discussion",
        kind: "user",
        text: "Hypothetical package discussed, employer offer not confirmed",
        source: "Synthetic conversation",
        recordedAt: new Date().toISOString(),
      },
    ],
  });
  await page.getByRole("button", { name: "All records", exact: true }).click();
  await page.getByLabel("Search records").fill(pending.company);
  await page.locator(".record-row").first().click();
  const terms = page.locator(".offer-terms");
  await expect(terms).toBeVisible();
  await terms
    .getByRole("spinbutton", { name: "Annual base", exact: true })
    .fill("190000");
  await terms
    .getByRole("textbox", { name: "Equity terms", exact: true })
    .fill("0.2% over four years");
  await terms
    .getByRole("textbox", { name: "Source or note", exact: true })
    .fill("User-reported revision from package discussion");
  await terms
    .getByRole("button", { name: "Save offer details", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await career(page)).opportunities.find((o: any) => o.id === pending.id)
          ?.offer.base,
    )
    .toBe(190000);
  const saved = await career(page);
  expect(
    saved.opportunities
      .find((o: any) => o.id === pending.id)
      .provenance.some(
        (e: any) =>
          e.kind === "user" &&
          e.text === "User-reported revision from package discussion",
      ),
  ).toBe(true);
  const status = await page.evaluate(async () => {
    const s = await (await fetch("/api/snapshot")).json();
    return s.applications.find((a: any) => a.id === "demo-6").status;
  });
  expect(status).toBe("pending");
  await page.reload();
  await page.getByRole("button", { name: "All records", exact: true }).click();
  await page.getByLabel("Search records").fill(pending.company);
  await page.locator(".record-row").first().click();
  await expect(
    page
      .locator(".offer-terms")
      .getByRole("spinbutton", { name: "Annual base", exact: true }),
  ).toHaveValue("190000");
});
test("outcomes use confirmed records and exact linked files, exclude drafts and classification notes", async ({
  page,
}) => {
  await page.route(/\/api\/(?:events|snapshot)$/, async (route) => {
    const response = await page.request.get("/api/snapshot"),
      snapshot = await response.json();
    snapshot.career.families = [
      {
        id: "audit-family",
        name: "Implementation analysis",
        rank: 1,
        evidence: ["Synthetic implementation evidence"],
        rationale: "Test role",
      },
    ];
    snapshot.career.templates = [
      {
        id: "unused-draft",
        familyId: "audit-family",
        version: 99,
        content: "Unused draft must not affect outcomes",
        claims: [],
        approvedAt: null,
        approvalNote: "",
      },
    ];
    for (const opportunity of snapshot.career.opportunities) {
      opportunity.roleFamilyId = ["demo-0", "demo-1"].includes(
        opportunity.applicationId,
      )
        ? "audit-family"
        : null;
      if (opportunity.applicationId === "demo-0")
        opportunity.provenance = [
          {
            id: "title-family-noise",
            kind: "hypothesis",
            text: "CLASSIFICATION_NOISE",
            source: "Title rule",
            recordedAt: new Date().toISOString(),
          },
          {
            id: "title-family-mistagged",
            kind: "employer",
            text: "CLASSIFICATION_MISTAGGED",
            source: "Title rule",
            recordedAt: new Date().toISOString(),
          },
          {
            id: "actual-employer",
            kind: "employer",
            text: "Employer said the role requires more integration experience.",
            source: "Recruiter reply",
            recordedAt: new Date().toISOString(),
          },
        ];
    }
    for (const id of ["demo-0", "demo-1"]) {
      const app = snapshot.applications.find((a: any) => a.id === id);
      app.evidence[0] = {
        ...app.evidence[0],
        kind: "resume",
        label: "Saved integration resume",
        sha256: "a".repeat(64),
        file: `/api/evidence/${app.evidence[0].id}/file`,
        mediaType: "text/plain",
        text: "Exact saved integration resume text",
      };
    }
    snapshot.applications
      .find((a: any) => a.id === "demo-0")
      .evidence.push({
        id: "audit-feedback",
        kind: "feedback",
        label: "Recruiter reply",
        basis: "Employer email",
        text: "Employer said the role requires more integration experience.",
      });
    snapshot.applications
      .find((a: any) => a.id === "demo-2")
      .evidence.push({
        id: "reference-only",
        kind: "resume",
        label: "Resume reference without a file",
        text: "A resume was mentioned",
        basis: "Unlinked source",
      });
    await route.fulfill(
      route.request().url().endsWith("/events")
        ? {
            status: 200,
            contentType: "text/event-stream",
            body: `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`,
          }
        : { response, json: snapshot },
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "Outcomes", exact: true }).click();
  await expect(page.locator(".outcomes-analysis")).toContainText(
    "14 confirmed applications",
  );
  await expect(page.locator(".role-outcomes tbody tr")).toHaveCount(2);
  await expect(page.locator(".resume-outcomes tbody tr")).toHaveCount(1);
  await expect(page.locator(".resume-outcomes tbody tr td").first()).toHaveText(
    "2",
  );
  await expect(page.locator(".outcomes-analysis")).not.toContainText(
    "Unused draft",
  );
  await expect(page.locator(".outcomes-analysis")).not.toContainText(
    "Template not recorded",
  );
  await expect(page.locator(".outcomes-analysis")).not.toContainText(
    "CLASSIFICATION_",
  );
  await expect(page.locator(".employer-message")).toHaveCount(1);
  await page.locator(".employer-message summary").click();
  await expect(page.locator(".employer-message")).toContainText(
    "Employer said the role requires more integration experience.",
  );
  await page
    .getByRole("button", {
      name: "Rejected: Implementation analysis, 2 applications",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.locator(".outcome-application")).toHaveCount(2);
  await expect(page.locator(".outcome-detail")).toContainText("Northstar");
  await page.getByRole("button", { name: "All outcomes", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Northstar · Forward Deployed Engineer",
      exact: true,
    })
    .click();
  await expect(page.locator(".outcome-application")).toHaveCount(2);
  await page
    .getByRole("button", { name: "View resume for Northstar", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toContainText(
    "Exact saved integration resume text",
  );
});
test("outcomes reconcile 413 confirmed records, deduplicate file links and paginate detail", async ({
  page,
}) => {
  await page.route(/\/api\/(?:events|snapshot)$/, async (route) => {
    const response = await page.request.get("/api/snapshot"),
      s = await response.json(),
      base = s.applications[0],
      op = s.career.opportunities[0];
    s.career.families = Array.from({ length: 3 }, (_, i) => ({
      id: `scale-family-${i}`,
      name: `Scale role ${i + 1}`,
      rank: i + 1,
      evidence: ["Synthetic evidence"],
      rationale: "Scale fixture",
    }));
    s.applications = Array.from({ length: 413 }, (_, i) => {
      const hash = (i % 2 ? "b" : "a").repeat(64),
        id = `scale-app-${i}`;
      return {
        ...base,
        id,
        company: `Scale Company ${i}`,
        title: `Original role ${i}`,
        status: i % 4 === 0 ? "rejected" : "pending",
        events: [
          {
            id: `event-${i}`,
            kind: "submission",
            stage: "applied",
            date: "2026-09-01",
            label: "Application received",
            detail: "Fixture receipt",
            evidenceIds: [],
          },
        ],
        evidence: [
          {
            id: `resume-${i}`,
            kind: "resume",
            label: "Resume",
            text: "Saved file",
            basis: "Submitted record",
            sha256: hash,
            file: `/api/evidence/resume-${i}/file`,
          },
          {
            id: `duplicate-resume-${i}`,
            kind: "resume",
            label: "Duplicate reference",
            text: "Same file",
            basis: "Same submitted record",
            sha256: hash,
            file: `/api/evidence/resume-${i}/file`,
          },
          ...(i < 100
            ? [
                {
                  id: `feedback-${i}`,
                  kind: "feedback",
                  label: "Employer message",
                  text: `Employer response ${i}`,
                  basis: "Employer email",
                },
              ]
            : []),
        ],
      };
    });
    s.career.opportunities = s.applications.map((a: any, i: number) => ({
      ...op,
      id: `scale-op-${i}`,
      applicationId: a.id,
      company: a.company,
      title: a.title,
      roleFamilyId: `scale-family-${i % 3}`,
      provenance: [],
    }));
    await route.fulfill(
      route.request().url().endsWith("/events")
        ? {
            status: 200,
            contentType: "text/event-stream",
            body: `event: snapshot\ndata: ${JSON.stringify(s)}\n\n`,
          }
        : { response, json: s },
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "Outcomes", exact: true }).click();
  await expect(page.locator(".outcomes-analysis")).toContainText(
    "413 confirmed applications",
  );
  await expect(page.locator(".role-outcomes tbody tr")).toHaveCount(3);
  await expect(
    page.locator(".role-outcomes tbody tr").first().locator("td").first(),
  ).toHaveText("138");
  await expect(page.locator(".resume-outcomes tbody tr")).toHaveCount(2);
  await expect(
    page.locator(".resume-outcomes tbody tr").first().locator("td").first(),
  ).toHaveText("207");
  await expect(page.locator(".employer-message")).toHaveCount(20);
  await page
    .getByRole("button", { name: "Show 20 more messages", exact: true })
    .click();
  await expect(page.locator(".employer-message")).toHaveCount(40);
  await page.getByRole("button", { name: "Scale role 1", exact: true }).click();
  await expect(page.locator(".outcome-detail")).toContainText(
    "138 applications",
  );
  await expect(page.locator(".outcome-application")).toHaveCount(50);
  await page
    .getByRole("button", { name: "Show 50 more applications", exact: true })
    .click();
  await expect(page.locator(".outcome-application")).toHaveCount(100);
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("the queue shows strong fits first, and a hold is the only thing that stops an agent", async ({
  page,
}) => {
  const role = (id: string, title: string) => ({
    id,
    company: "Acme Robotics",
    companyKey: "acmerobotics",
    title,
    jobKey: `acme|${id}`,
    url: `https://jobs.example.com/acme/${id}`,
    description: "Discovered by the nightly search.",
    location: "New York, NY",
    compensation: { currency: "USD", annualBase: 190000, annualCash: null },
  });
  await command(page, "opportunities", {
    opportunities: [
      role("q-top", "Forward Deployed Engineer"),
      role("q-standard", "Solutions Engineer"),
    ],
  });
  const decidedAt = new Date().toISOString();
  await command(page, "triage", {
    opportunityId: "q-top",
    triage: {
      tier: "top",
      score: 92,
      reason: "Title matches the top family; pay clears the floor.",
      decidedAt,
    },
  });
  await command(page, "triage", {
    opportunityId: "q-standard",
    triage: {
      tier: "standard",
      score: 70,
      reason: "Fits the active grant.",
      decidedAt,
    },
  });
  await page.getByRole("button", { name: "Top roles", exact: true }).click();
  await tab(page, "Queue");
  const approved = page.locator('.queue-tier[data-tier="approved"]');
  await expect(approved.locator("h3")).toContainText(
    "Agents apply under your grant · 2 · 1 top",
  );
  await expect(approved.locator(".queue-row").first()).toHaveAttribute(
    "data-tier",
    "top",
  );
  await expect(
    approved.locator(".queue-row").first().locator(".tier-top"),
  ).toHaveText("Top");
  await expect(approved).toContainText("USD 190K base");
  await approved
    .locator(".queue-row")
    .first()
    .getByRole("button", { name: "Hold" })
    .click();
  const held = page.locator('.queue-tier[data-tier="hold"]');
  await expect(held.locator("h3")).toContainText("On hold for your review · 1");
  await expect
    .poll(
      async () =>
        (await career(page)).opportunities.find((o: any) => o.id === "q-top")
          .triage,
    )
    .toMatchObject({ decision: "hold", decidedBy: "user" });
  await held.getByRole("button", { name: "Release" }).click();
  await expect(held).toHaveCount(0);
  await approved
    .locator(".queue-row")
    .last()
    .getByRole("button", { name: "Skip" })
    .click();
  await expect(approved.locator(".queue-row")).toHaveCount(1);
});
test("the in-flight strip follows an agent through claim, vetting and preparation", async ({
  page,
}) => {
  const existing = (await career(page)).families;
  await command(page, "families", {
    families: [
      ...existing,
      {
        id: "fam-flight",
        name: "Flight Engineering",
        rank: existing.length + 1,
        evidence: ["Built a product"],
        rationale: "Implementation",
      },
    ],
  });
  await command(page, "opportunities", {
    opportunities: [
      {
        id: "flight-1",
        company: "Orbit Works",
        companyKey: "orbitworks",
        title: "Deployment Engineer",
        jobKey: "orbit|flight-1",
        url: "https://jobs.example.com/orbit/flight-1",
        description: "Full posting text.",
        location: "Denver",
        roleFamilyId: "fam-flight",
        compensation: {
          currency: "USD",
          annualBase: 180000,
          annualCash: 180000,
        },
      },
    ],
  });
  await command(page, "grant", {
    grant: {
      id: "grant-flight",
      roleFamilyIds: ["fam-flight"],
      locations: ["Denver"],
      exclusions: [],
      minAnnualBase: 150000,
      currency: "USD",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      maxApplications: 2,
      approvedAt: new Date().toISOString(),
      approvalNote: "Approved batch",
    },
  });
  await command(page, "claim", {
    opportunityId: "flight-1",
    owner: "scout-1",
    grantId: "grant-flight",
  });
  await page.getByRole("button", { name: "Top roles", exact: true }).click();
  await tab(page, "Queue");
  const row = page.locator(".flight-row", { hasText: "Orbit Works" });
  await expect(row).toContainText("scout-1");
  await expect(
    row.locator('.flight-steps li[data-state="current"]'),
  ).toHaveText("claimed");
  await expect(page.locator(".agent-activity")).toContainText(
    "1 agent · 1 in flight",
  );
  await command(page, "vet", {
    opportunityId: "flight-1",
    vetting: {
      verdict: "pass",
      checks: ["full posting read", "pay clears floor"],
      by: "agent",
      at: new Date().toISOString(),
    },
  });
  await expect(
    row.locator('.flight-steps li[data-state="current"]'),
  ).toHaveText("vetted");
  await command(page, "release", {
    opportunityId: "flight-1",
    owner: "scout-1",
    fence: 1,
  });
  await expect(page.locator(".agent-activity")).toHaveCount(0);
});
test("a recorded employer limit shows on the company and its queued roles", async ({
  page,
}) => {
  await command(page, "opportunities", {
    opportunities: [
      {
        id: "cap-role",
        company: "Acme Robotics",
        companyKey: "acmerobotics",
        title: "Deployment Strategist",
        jobKey: "acme|cap-role",
        url: "https://jobs.example.com/acme/cap-role",
        description: "Discovered by the board poll.",
        location: "Chicago, IL",
        compensation: { currency: "USD", annualBase: 170000, annualCash: null },
      },
    ],
  });
  await command(page, "triage", {
    opportunityId: "cap-role",
    triage: {
      tier: "standard",
      score: 60,
      reason: "Fits the grant.",
      decidedAt: new Date().toISOString(),
    },
  });
  await page.getByRole("button", { name: "Top roles", exact: true }).click();
  await tab(page, "Companies");
  const acme = page.locator(".company-history", { hasText: "Acme Robotics" });
  await acme.locator("summary").click();
  await acme.getByLabel("Acme Robotics application limit").fill("2");
  await acme.getByLabel("Acme Robotics limit window in days").fill("60");
  await acme
    .getByLabel("Acme Robotics limit source")
    .fill("Careers FAQ: two applications per 60 days");
  await acme.getByRole("button", { name: "Save limit" }).click();
  await expect(acme.locator(".company-cap")).toHaveText("0 of 2 in 60 days");
  await expect
    .poll(async () => (await career(page)).companyPolicies)
    .toMatchObject([
      { companyKey: "acmerobotics", maxApplications: 2, windowDays: 60 },
    ]);
  await tab(page, "Queue");
  const row = page.locator(".queue-row", { hasText: "Deployment Strategist" });
  await expect(row.locator(".company-cap")).toHaveAttribute(
    "data-at-cap",
    "false",
  );
  await tab(page, "Companies");
  await acme.locator("summary").click();
  await acme.getByRole("button", { name: "Remove limit" }).click();
  await expect(acme.locator(".company-cap")).toHaveCount(0);
});
test("an added city gets a scene and a globe marker without a code change", async ({
  page,
}) => {
  await command(page, "city", {
    city: {
      id: "boise",
      label: "Boise",
      aliases: ["Boise", "Meridian, ID"],
      lon: -116.202,
      lat: 43.615,
      addedBy: "user",
      addedAt: new Date().toISOString(),
    },
  });
  await command(page, "opportunities", {
    opportunities: [
      {
        id: "boise-role",
        company: "Acme Robotics",
        companyKey: "acmerobotics",
        title: "Forward Deployed Engineer",
        jobKey: "acme|boise-role",
        url: "https://jobs.example.com/acme/boise-role",
        description: "Discovered by the board poll.",
        location: "Boise, ID",
        compensation: { currency: "USD", annualBase: 160000, annualCash: null },
      },
    ],
  });
  await command(page, "triage", {
    opportunityId: "boise-role",
    triage: {
      tier: "standard",
      score: 60,
      reason: "Fits the grant.",
      decidedAt: new Date().toISOString(),
    },
  });
  const globe = page.getByRole("slider", { name: "Rotate globe" });
  await globe.focus();
  for (let i = 0; i < 4; i++) await globe.press("ArrowLeft");
  const boise = page.locator('.globe-city[aria-label^="Boise"]');
  await expect(boise).toHaveAttribute("data-queued", "1");
  await expect(boise).toHaveAttribute("data-queue-only", "true");
  await page.evaluate(async () => {
    const s = await (await fetch("/api/snapshot")).json();
    await fetch("/api/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        expectedRevision: s.view.revision,
        action: "theme",
        payload: { theme: "boise" },
      }),
    });
  });
  await expect(page.locator(".scene")).toHaveAttribute("data-scene", "boise");
  await expect(page.locator(".scene")).toHaveAttribute(
    "data-landmark",
    "Boise skyline",
  );
  // Removing the city while the view still shows it must not break the app.
  await command(page, "city", { id: "boise", remove: true });
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "neutral");
  await expect(page.locator(".earth-globe")).toBeVisible();
});
