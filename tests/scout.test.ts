import { expect, it } from "vitest";
import { opportunitySchema } from "../shared/career";
import {
  boardFromUrl,
  defaultTitlePatterns,
  filterPostings,
  locationMatches,
  parseBoard,
  toOpportunity,
  type Board,
} from "../shared/scout";

const ashby: Board = {
  ats: "ashby",
  slug: "acme",
  company: "Acme",
  addedAt: null,
  source: "",
};
const gh: Board = {
  ats: "greenhouse",
  slug: "acme",
  company: "",
  addedAt: null,
  source: "",
};
const lever: Board = {
  ats: "lever",
  slug: "acme",
  company: "",
  addedAt: null,
  source: "",
};

it("recognizes ATS boards from job URLs", () => {
  expect(
    boardFromUrl("https://jobs.ashbyhq.com/Amari/3b40-8a6c"),
  ).toMatchObject({
    ats: "ashby",
    slug: "Amari",
  });
  expect(
    boardFromUrl("https://job-boards.greenhouse.io/anthropic/jobs/4985877008"),
  ).toMatchObject({ ats: "greenhouse", slug: "anthropic" });
  expect(boardFromUrl("https://jobs.lever.co/palantir/dab3")).toMatchObject({
    ats: "lever",
    slug: "palantir",
  });
  expect(boardFromUrl("https://www.linkedin.com/jobs/view/1")).toBeNull();
  expect(boardFromUrl("not a url")).toBeNull();
});

it("normalizes the three board formats", () => {
  const a = parseBoard(ashby, {
    jobs: [
      {
        title: "Forward Deployed Engineer",
        jobUrl: "https://jobs.ashbyhq.com/acme/1",
        location: "New York City, NY",
        isRemote: false,
        workplaceType: "Hybrid",
        publishedAt: "2026-09-22T10:00:00Z",
        descriptionPlain: "Build things.",
        compensation: {
          compensationTierSummary: "$150K – $200K • Offers Equity",
          summaryComponents: [
            {
              compensationType: "Salary",
              currencyCode: "USD",
              minValue: 150000,
              maxValue: 200000,
            },
          ],
        },
      },
    ],
  });
  expect(a).toHaveLength(1);
  expect(a[0]).toMatchObject({
    company: "Acme",
    workArrangement: "hybrid",
    compensation: { currency: "USD", min: 150000, max: 200000 },
    description: "Build things.",
  });
  const g = parseBoard(gh, {
    jobs: [
      {
        title: "Solutions Engineer",
        absolute_url: "https://job-boards.greenhouse.io/acme/jobs/9",
        location: { name: "Remote, United States" },
        updated_at: "2026-09-21T00:00:00-04:00",
        content: "<p>Hello &amp; welcome</p><ul><li>One</li></ul>",
      },
    ],
  });
  expect(g[0]).toMatchObject({
    company: "acme",
    workArrangement: "remote",
    description: "Hello & welcome\nOne",
  });
  const l = parseBoard(lever, [
    {
      text: "Applied AI Engineer",
      hostedUrl: "https://jobs.lever.co/acme/2",
      categories: { location: "Chicago, IL" },
      createdAt: 1790000000000,
      descriptionPlain: "x",
      salaryRange: { currency: "USD", min: 160000, max: 210000 },
    },
  ]);
  expect(l[0]).toMatchObject({
    publishedAt: "2026-09-21T14:13:20.000Z",
    compensation: { min: 160000, max: 210000 },
  });
  expect(parseBoard(ashby, { unexpected: true })).toEqual([]);
  expect(parseBoard(ashby, { jobs: [{ title: "No URL" }] })).toEqual([]);
});

it("filters by title family, accepted locations, checkpoint and known URLs", () => {
  const rows = parseBoard(ashby, {
    jobs: [
      {
        title: "Forward Deployed Engineer",
        jobUrl: "https://x/1",
        location: "New York",
        publishedAt: "2026-09-22T00:00:00Z",
      },
      {
        title: "Forward Deployed Engineer",
        jobUrl: "https://x/2",
        location: "London",
        publishedAt: "2026-09-22T00:00:00Z",
      },
      {
        title: "Accountant",
        jobUrl: "https://x/3",
        location: "New York",
        publishedAt: "2026-09-22T00:00:00Z",
      },
      {
        title: "AI Solutions Architect",
        jobUrl: "https://x/4",
        location: "Anywhere",
        isRemote: true,
        publishedAt: "2026-09-22T00:00:00Z",
      },
      {
        title: "Product Engineer",
        jobUrl: "https://x/5",
        location: "Chicago",
        publishedAt: "2026-09-01T00:00:00Z",
      },
      {
        title: "Product Engineer",
        jobUrl: "https://x/6?utm_source=a",
        location: "Chicago",
        publishedAt: "2026-09-22T00:00:00Z",
      },
    ],
  });
  const kept = filterPostings(rows, {
    titlePatterns: defaultTitlePatterns,
    locations: ["Remote", "New York", "Chicago"],
    since: "2026-09-15T00:00:00Z",
    knownUrls: new Set(["https://x/6"]),
  });
  expect(kept.map((r) => r.url)).toEqual(["https://x/1", "https://x/4"]);
  expect(locationMatches("Washington, DC", ["Washington DC"])).toBe(true);
  expect(locationMatches("Remote (US)", ["Remote"])).toBe(true);
  expect(locationMatches("Paris", ["New York"])).toBe(false);
  expect(locationMatches("Anywhere", [])).toBe(true);
  expect(locationMatches("Remote - APAC", ["Remote"])).toBe(false);
  expect(locationMatches("Japan - Remote", ["Remote"])).toBe(false);
  expect(locationMatches("Remote, US or London", ["Remote"])).toBe(true);
});

it("builds an opportunity the career schema accepts", () => {
  const [p] = parseBoard(ashby, {
    jobs: [
      {
        title: "Forward Deployed Engineer - NY",
        jobUrl: "https://jobs.ashbyhq.com/acme/9a43-6e46",
        location: "New York City",
        publishedAt: "2026-09-22T00:00:00Z",
        descriptionPlain: "d",
        compensation: {
          compensationTierSummary: "$150K – $200K",
          summaryComponents: [
            {
              compensationType: "Salary",
              currencyCode: "USD",
              minValue: 150000,
              maxValue: 200000,
            },
          ],
        },
      },
    ],
  });
  const o = opportunitySchema.parse(
    toOpportunity(p, "2026-09-23T00:00:00.000Z"),
  );
  expect(o.id).toBe("scout-acme-9a43-6e46");
  expect(o.lifecycle).toBe("discovered");
  expect(o.compensation).toEqual({
    currency: "USD",
    annualBase: 150000,
    annualCash: null,
  });
  expect(o.provenance[0].kind).toBe("employer");
  expect(JSON.parse(o.provenance[0].text).publishedAt).toBe(
    "2026-09-22T00:00:00Z",
  );
});
