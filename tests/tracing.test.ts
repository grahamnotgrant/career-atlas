import { expect, it } from "vitest";
import { demoManifest } from "../shared/demo";
import {
  stageStats,
  outcomeBreakdown,
  currentStage,
  journeys,
  center,
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

it("draws direct recorded connections and counts each application once per connection", async () => {
  const { connections } = await import("../src/journey");
  const apps = demoManifest().applications;
  const edges = connections(apps);
  expect(edges.find((e) => e.id === "applied:pending")?.ids).toHaveLength(8);
  expect(edges.find((e) => e.id === "applied:recruiter")?.ids).toHaveLength(5);
  expect(edges.find((e) => e.id === "applied:rejected")?.ids).toEqual([
    "demo-2",
  ]);
  expect(edges.find((e) => e.id === "hiring:rejected")?.ids).toEqual([
    "demo-1",
  ]);
  for (const p of journeys(apps)) expect(p.path).not.toMatch(/[ACQ]/);
});
