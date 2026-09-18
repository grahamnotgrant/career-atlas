import { expect, it } from "vitest";
import { demoManifest } from "../shared/demo";
import {
  stageStats,
  outcomeBreakdown,
  currentStage,
  journeys,
  center,
  selectionMembers,
  placeCounts,
  ribbonWidth,
  ribbonPath,
} from "../src/journey";
it("distinguishes reaching a stage, currently occupying it, and progressing beyond it", () => {
  const apps = demoManifest().applications;
  const stats = stageStats(apps, "recruiter");
  expect(stats.reached).toHaveLength(5);
  expect(stats.current).toHaveLength(3);
  expect(stats.passed).toHaveLength(2);
  expect(stats.ended).toHaveLength(2);
  expect(currentStage(apps[0])).toBe(null);
});
it("does not turn an unclassified interview into a rejection after applying", () => {
  const a = demoManifest().applications[2];
  a.events.push({
    id: "unknown-interview",
    stage: null,
    date: null,
    label: "Interview",
    kind: "interview",
    detail: "Stage unknown",
    evidenceIds: [],
  });
  expect(outcomeBreakdown([a], "rejected")).toEqual([
    { label: "Interview stage unknown", count: 1 },
  ]);
  expect(stageStats([a], "applied").current).toHaveLength(0);
  expect(journeys([a])[0].uncertain).toBe(true);
});
it("keeps application endpoints outside the globe and active interviews at the top", () => {
  const apps = demoManifest().applications,
    paths = journeys(apps);
  for (const p of paths)
    expect(Math.hypot(p.end.x - center.x, p.end.y - center.y)).toBeGreaterThan(
      257,
    );
  for (const p of paths.filter(
    (p) => apps.find((a) => a.id === p.id)?.status === "interview",
  ))
    expect(p.end.y).toBeLessThan(center.y);
});

it("does not equate missing interview history with a rejection before interview", () => {
  const app = demoManifest().applications.find(
    (a) =>
      a.status === "rejected" && a.events.filter((e) => e.stage).length === 1,
  )!;
  expect(outcomeBreakdown([app], "rejected")).toEqual([
    { label: "No interview stage recorded", count: 1 },
  ]);
});

it("does not draw backward progression when an earlier round completes after the next invitation", async () => {
  const { recordedStages } = await import("../src/journey");
  const a = structuredClone(demoManifest().applications[0]);
  a.events = ["applied", "recruiter", "hiring", "recruiter", "hiring"].map(
    (stage, i) => ({
      id: `order-${i}`,
      stage: stage as any,
      kind: i === 0 ? "submission" : i < 3 ? "invitation" : "interview",
      date: "2026-09-10",
      label: "Recorded event",
      detail: "",
      evidenceIds: [],
    }),
  );
  expect(recordedStages(a)).toEqual(["applied", "recruiter", "hiring"]);
  expect(a.events).toHaveLength(5);
});
it("selects the applications at a stage now, not everyone who reached it", () => {
  const apps = demoManifest().applications;
  const stats = stageStats(apps, "recruiter");
  expect(stats.reached.length).toBeGreaterThan(stats.current.length);
  expect(selectionMembers(apps, { kind: "stage", id: "recruiter" })).toEqual(
    stats.current,
  );
  expect(
    selectionMembers(apps, { kind: "outcome", id: "rejected" }).every(
      (a) => a.status === "rejected",
    ),
  ).toBe(true);
});
it("draws one ribbon per place however many applications it holds", () => {
  const places = [
    { id: "nyc", ids: Array.from({ length: 214 }, (_, i) => `n${i}`) },
    { id: "austin", ids: ["a1", "a2"] },
    { id: "denver", ids: ["d1"] },
  ];
  const members = new Set([...places[0].ids, "a1", "other"]);
  const counted = placeCounts(places, members);
  expect(counted.map((p) => [p.id, p.members.length])).toEqual([
    ["nyc", 214],
    ["austin", 1],
  ]);
  expect(ribbonWidth(1)).toBeLessThan(ribbonWidth(60));
  expect(ribbonWidth(214)).toBe(ribbonWidth(5000));
});
it("bows ribbons away from the orb axis so they fan out instead of crossing", () => {
  const orb = { x: 675, y: 105 },
    axis = { x: 675, y: 390 };
  const control = (path: string) => Number(path.split("Q")[1].split(" ")[0]);
  const left = ribbonPath(orb, { x: 560, y: 380 }, axis),
    right = ribbonPath(orb, { x: 790, y: 380 }, axis);
  expect(control(left)).toBeLessThan((675 + 560) / 2);
  expect(control(right)).toBeGreaterThan((675 + 790) / 2);
  expect(ribbonPath(orb, orb, axis)).toBe("");
});
