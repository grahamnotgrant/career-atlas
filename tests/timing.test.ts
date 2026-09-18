import { expect, it } from "vitest";
import type { Application } from "../shared/model";
import {
  ageBuckets,
  arrangementConversion,
  daysSilent,
  daysToOutcome,
  eventGaps,
  isStale,
  median,
  placeConversion,
  sinceDigest,
  weeklyCadence,
  weekStart,
  outcomeOf,
  pools,
} from "../src/journey";

let n = 0;
function app(
  status: Application["status"],
  location: string,
  events: [
    Application["events"][number]["kind"],
    string | null,
    Application["events"][number]["stage"],
  ][],
): Application {
  const id = `t${++n}`;
  return {
    id,
    company: `Co ${id}`,
    title: "Engineer",
    location,
    theme: "neutral",
    compensation: "",
    status,
    submitted: events[0][1],
    asOf: "2026-09-17",
    verification: "",
    events: events.map(([kind, date, stage], i) => ({
      id: `${id}-e${i}`,
      kind,
      date,
      stage,
      label: kind,
      detail: "",
      evidenceIds: [],
    })),
    evidence: [],
  };
}
const asOf = "2026-09-17";
const silent = app("pending", "New York, NY", [
  ["submission", "2026-07-01", "applied"],
]);
const fresh = app("pending", "Remote, US", [
  ["submission", "2026-09-10", "applied"],
]);
const rejectedFast = app("rejected", "Chicago, IL", [
  ["submission", "2026-08-01", "applied"],
  ["decision", "2026-08-05", null],
]);
const interviewing = app("interview", "New York, NY", [
  ["submission", "2026-08-01", "applied"],
  ["invitation", "2026-08-10", "recruiter"],
  ["interview", "2026-08-29", "hiring"],
]);
const all = [silent, fresh, rejectedFast, interviewing];

it("measures silence from the last dated contact and calls a month of it stale", () => {
  expect(daysSilent(silent, asOf)).toBe(78);
  expect(daysSilent(fresh, asOf)).toBe(7);
  expect(daysSilent(interviewing, asOf)).toBe(19);
  expect(isStale(silent, asOf)).toBe(true);
  expect(isStale(fresh, asOf)).toBe(false);
  expect(isStale(interviewing, asOf)).toBe(false);
});
it("buckets ages and finds a median", () => {
  expect(ageBuckets([3, 10, 20, 40, 100]).map((b) => b.count)).toEqual([
    1, 1, 1, 1, 1,
  ]);
  expect(ageBuckets([7]).map((b) => b.count)).toEqual([0, 1, 0, 0, 0]);
  expect(median([5, 1, 9])).toBe(5);
  expect(median([1, 2, 3, 4])).toBe(3);
  expect(median([])).toBeNull();
});
it("reports days to a decision and the gap before each event", () => {
  expect(daysToOutcome(rejectedFast)).toBe(4);
  expect(daysToOutcome(silent)).toBeNull();
  expect(eventGaps(interviewing)).toEqual([null, 9, 19]);
});
it("rates places by responses, not volume, and marks thin evidence", () => {
  const rows = placeConversion(
    [
      { id: "nyc", ids: [silent.id, interviewing.id, fresh.id] },
      { id: "chicago", ids: [rejectedFast.id, silent.id, fresh.id] },
      { id: "denver", ids: [fresh.id] },
    ],
    all,
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  expect(byId.get("nyc")!.responded).toBe(1);
  expect(byId.get("nyc")!.band).toBe("above");
  expect(byId.get("chicago")!.band).toBe("none");
  expect(byId.get("denver")!.band).toBe("few");
});
it("compares remote with on-site conversion side by side", () => {
  const [remote, onsite] = arrangementConversion(all);
  expect(remote.applied).toBe(1);
  expect(remote.responded).toBe(0);
  expect(onsite.applied).toBe(3);
  expect(onsite.responded).toBe(1);
});
it("counts what went out and what came back per week", () => {
  expect(weekStart("2026-09-17")).toBe("2026-09-14");
  const rows = weeklyCadence(all, 8, asOf);
  expect(rows).toHaveLength(8);
  expect(rows.at(-1)!.week).toBe("2026-09-14");
  const aug10 = rows.find((r) => r.week === "2026-08-10")!;
  expect(aug10.responses).toBe(1);
  expect(rows.find((r) => r.week === "2026-09-07")!.applied).toBe(1);
});
it("digests only what landed after the last look", () => {
  const digest = sinceDigest(all, "2026-08-20");
  expect(digest.interviews.map((a) => a.id)).toEqual([interviewing.id]);
  expect(digest.rejected).toEqual([]);
  expect(sinceDigest(all, "2026-08-01").rejected.map((a) => a.id)).toEqual([
    rejectedFast.id,
  ]);
});

it("shows a month of silence as No reply without changing the record", () => {
  expect(pools.map((p) => p.id)).toEqual([
    "pending",
    "noreply",
    "rejected",
    "closed",
  ]);
  expect(outcomeOf(silent, asOf)).toBe("noreply");
  expect(silent.status).toBe("pending");
  expect(outcomeOf(fresh, asOf)).toBe("pending");
  expect(outcomeOf(rejectedFast, asOf)).toBe("rejected");
  expect(outcomeOf(interviewing, asOf)).toBeNull();
});
