import { expect, it } from "vitest";
import { isCleared, isQueued, opportunitySchema } from "../shared/career";
import { geographicGroups } from "../shared/locations";

const role = (id: string, extra: Record<string, unknown>) =>
  opportunitySchema.parse({
    id,
    company: "Acme",
    companyKey: "acme",
    title: "Forward Deployed Engineer",
    jobKey: `acme|${id}`,
    url: `https://jobs.example.com/${id}`,
    description: "",
    location: "New York, NY",
    ...extra,
  });
const triage = (tier: string, decision = "approved") => ({
  tier,
  score: null,
  reason: "r",
  decidedAt: "2026-09-23T00:00:00.000Z",
  decidedBy: "agent",
  decision,
});

it("queued and cleared follow triage, hold and lifecycle", () => {
  const cases: [Record<string, unknown>, boolean, boolean][] = [
    [{}, false, false],
    [{ triage: triage("top") }, true, true],
    [{ triage: triage("standard", "hold") }, true, false],
    [{ triage: triage("skip") }, false, false],
    [{ triage: triage("top", "skipped") }, false, false],
    [{ triage: triage("top"), lifecycle: "prepared" }, true, true],
    [{ triage: triage("top"), lifecycle: "confirmed" }, false, false],
    [{ triage: triage("top"), lifecycle: "uncertain" }, false, false],
  ];
  for (const [extra, queued, cleared] of cases) {
    const o = role("x", extra);
    expect(isQueued(o), JSON.stringify(extra)).toBe(queued);
    expect(isCleared(o), JSON.stringify(extra)).toBe(cleared);
  }
});

it("cleared roles group by city like applications, dropping unknown places", () => {
  const groups = geographicGroups(
    [
      role("a", { location: "New York, NY" }),
      role("b", { location: "Remote (US)" }),
      role("c", { location: "Nowhere Special" }),
    ].map((o) => ({
      id: o.id,
      location: o.location,
      theme: "neutral" as const,
    })),
  ).filter((g) => g.coordinates);
  expect(groups.map((g) => [g.id, g.ids])).toEqual([["nyc", ["a"]]]);
});
