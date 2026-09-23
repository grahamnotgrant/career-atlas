import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { opportunitySchema } from "../shared/career";
import {
  boardFromUrl,
  boardListSchema,
  boardRequests,
  hiringThreadCompanies,
  slugGuesses,
  workdayPostedOn,
  workdaySearchTerms,
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

it("ships a valid starter board list for fresh installations", () => {
  const starter = boardListSchema.parse(
    JSON.parse(readFileSync("skills/scout-roles/starter-boards.json", "utf8")),
  );
  expect(starter.boards.length).toBeGreaterThan(10);
  expect(new Set(starter.boards.map((b) => `${b.ats}:${b.slug}`)).size).toBe(
    starter.boards.length,
  );
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

it("recognizes Workable, SmartRecruiters and Workday boards from URLs", () => {
  expect(
    boardFromUrl("https://apply.workable.com/hotjar/j/ABC123/"),
  ).toMatchObject({
    ats: "workable",
    slug: "hotjar",
  });
  expect(
    boardFromUrl(
      "https://jobs.smartrecruiters.com/Bosch/744000148454651-engineer",
    ),
  ).toMatchObject({ ats: "smartrecruiters", slug: "Bosch" });
  expect(
    boardFromUrl(
      "https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Jose/Engineer_R1",
    ),
  ).toMatchObject({
    ats: "workday",
    slug: "adobe",
    host: "wd5",
    site: "external_experienced",
  });
  expect(
    boardFromUrl("https://adobe.wd5.myworkdayjobs.com/wday/cxs/adobe/x/jobs"),
  ).toBeNull();
});

it("parses the three new board formats and Workday's relative dates", () => {
  const wd: Board = {
    ats: "workday",
    slug: "adobe",
    host: "wd5",
    site: "external_experienced",
    company: "Adobe",
    addedAt: null,
    source: "",
  };
  const rows = parseBoard(wd, {
    jobPostings: [
      {
        title: "AEP Lead Data Solutions Engineer",
        externalPath: "/job/San-Jose/AEP_R166535",
        locationsText: "San Jose",
        postedOn: "Posted 5 Days Ago",
      },
    ],
  });
  expect(rows[0].url).toBe(
    "https://adobe.wd5.myworkdayjobs.com/external_experienced/job/San-Jose/AEP_R166535",
  );
  expect(Date.now() - Date.parse(rows[0].publishedAt!)).toBeGreaterThan(
    4.9 * 86_400_000,
  );
  expect(workdayPostedOn("Posted Today", null)).not.toBeNull();
  expect(
    workdayPostedOn(
      "Posted 30+ Days Ago",
      null,
      new Date("2026-09-23T00:00:00Z"),
    ),
  ).toBe("2026-08-24T00:00:00.000Z");
  expect(workdayPostedOn("nothing", null)).toBeNull();
  const sr: Board = {
    ats: "smartrecruiters",
    slug: "smartrecruiters",
    company: "",
    addedAt: null,
    source: "",
  };
  expect(
    parseBoard(sr, {
      content: [
        {
          id: "744000148454651",
          name: "Data Operations Consultant ",
          releasedDate: "2026-09-09T09:43:26.403Z",
          location: {
            city: "Poland",
            region: "Remote",
            country: "pl",
            remote: true,
          },
          company: { name: "SmartRecruiters Inc" },
        },
      ],
    })[0],
  ).toMatchObject({
    company: "SmartRecruiters Inc",
    title: "Data Operations Consultant",
    url: "https://jobs.smartrecruiters.com/smartrecruiters/744000148454651",
    workArrangement: "remote",
  });
  const wk: Board = {
    ats: "workable",
    slug: "acme",
    company: "",
    addedAt: null,
    source: "",
  };
  expect(
    parseBoard(wk, {
      results: [
        {
          title: "Solutions Engineer",
          shortcode: "AB12CD",
          published: "2026-09-20T00:00:00Z",
          remote: false,
          location: {
            city: "Austin",
            region: "TX",
            country: "United States",
            workplaceType: "hybrid",
          },
        },
      ],
    })[0],
  ).toMatchObject({
    url: "https://apply.workable.com/acme/j/AB12CD/",
    location: "Austin, TX, United States",
    workArrangement: "hybrid",
  });
  expect(workdaySearchTerms.length).toBeGreaterThan(3);
  expect(boardRequests(wd)).toHaveLength(workdaySearchTerms.length);
  expect(boardRequests(wd)[0].init?.method).toBe("POST");
});

it("guesses slugs from company names and reads companies out of the HN hiring thread", () => {
  expect(slugGuesses("Acme Robotics, Inc.")).toContain("acmerobotics");
  expect(slugGuesses("Acme Robotics, Inc.")).toContain("acme-robotics");
  expect(slugGuesses("Scope Labs")).toContain("scope");
  expect(
    hiringThreadCompanies([
      "Modash.io | Senior Product Engineer | Remote (Europe) | Full-time | €75k–110k |  https:&#x2F;&#x2F;modash.io",
      "<p>Quill | Fullstack SWE | Full-time | Remote</p>",
      "Snout  https:&#x2F;&#x2F;snout.com&#x2F;  | Multiple Engineering + Product Roles | Remote US",
      "I am looking for work, python, remote",
      "Location: Chicago | Remote: yes | Technologies: Python",
    ]),
  ).toEqual(["Modash.io", "Quill", "Snout"]);
});
