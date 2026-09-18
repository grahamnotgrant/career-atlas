import { afterEach, expect, it, vi } from "vitest";
import {
  ArrivalQueue,
  ARRIVAL_DURATION,
  type ArrivalStorage,
} from "../src/arrivalQueue";
const app = (id: string, status = "pending") => ({ id, status });
function storage(): ArrivalStorage {
  const values = new Map<string, string>();
  return {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => {
      values.set(k, v);
    },
  };
}
afterEach(() => vi.useRealTimers());
it("baselines historical data, queues only new pending applications and keeps full backlog", () => {
  const q = new ArrivalQueue("one", storage(), () => {});
  q.observe([app("old")]);
  expect(q.state.pendingArrivalIds).toEqual([]);
  q.observe([
    app("old"),
    ...Array.from({ length: 8 }, (_, i) => app(String(i))),
    app("rejected", "rejected"),
    app("interview", "interview"),
  ]);
  expect(q.state.pendingArrivalIds).toHaveLength(8);
  q.pause();
  expect(q.state.newIds).toEqual([]);
});
it("persists unseen arrivals across reload and detects additions while away without replaying baseline", () => {
  const saved = storage();
  const q = new ArrivalQueue("one", saved, () => {});
  q.observe([app("old")]);
  q.observe([app("old"), app("new")]);
  const reloaded = new ArrivalQueue("one", saved, () => {});
  reloaded.observe([app("old"), app("new"), app("away")]);
  expect(reloaded.state.pendingArrivalIds).toEqual(["new", "away"]);
  const other = new ArrivalQueue("two", saved, () => {});
  other.observe([app("old"), app("new"), app("away")]);
  expect(other.state.pendingArrivalIds).toEqual([]);
});
it("plays only visible cohort in batches of three and acknowledges only after uninterrupted duration", () => {
  vi.useFakeTimers();
  const q = new ArrivalQueue("one", storage(), () => {});
  q.observe([]);
  q.observe(["a", "b", "c", "d", "hidden"].map((id) => app(id)));
  q.play(["a", "b", "c", "d"]);
  expect(q.state.newIds).toEqual(["a", "b", "c"]);
  vi.advanceTimersByTime(ARRIVAL_DURATION - 1);
  expect(q.state.pendingArrivalIds).toHaveLength(5);
  q.pause();
  vi.advanceTimersByTime(5000);
  expect(q.state.pendingArrivalIds).toHaveLength(5);
  q.play(["a", "b", "c", "d"]);
  vi.advanceTimersByTime(ARRIVAL_DURATION);
  expect(q.state.pendingArrivalIds).toEqual(["d", "hidden"]);
  q.play(["d"]);
  vi.advanceTimersByTime(ARRIVAL_DURATION);
  expect(q.state.pendingArrivalIds).toEqual(["hidden"]);
});
it("active arrivals remain queued on reload and stop playing progressed records", () => {
  vi.useFakeTimers();
  const saved = storage();
  const q = new ArrivalQueue("one", saved, () => {});
  q.observe([]);
  q.observe([app("a")]);
  q.play(["a"]);
  const reloaded = new ArrivalQueue("one", saved, () => {});
  reloaded.observe([app("a")]);
  expect(reloaded.state.pendingArrivalIds).toEqual(["a"]);
  q.pause();
  reloaded.play(["a"]);
  vi.advanceTimersByTime(ARRIVAL_DURATION);
  expect(reloaded.state.pendingArrivalIds).toEqual([]);
  reloaded.observe([app("a"), app("b")]);
  reloaded.play(["b"]);
  expect(reloaded.state.newIds).toEqual(["b"]);
  reloaded.observe([app("a"), app("b", "rejected")]);
  expect(reloaded.state.newIds).toEqual([]);
  expect(reloaded.state.pendingArrivalIds).toEqual([]);
});
it("survives blocked or malformed storage without losing its in-memory queue", () => {
  const q = new ArrivalQueue(
    "one",
    {
      getItem: () => "{bad",
      setItem: () => {
        throw new Error("quota");
      },
    },
    () => {},
  );
  q.observe([app("old")]);
  q.observe([app("old"), app("new")]);
  expect(q.state.pendingArrivalIds).toEqual(["new"]);
});

it("does not acknowledge an unseen filtered backlog merely because time passes", () => {
  vi.useFakeTimers();
  const q = new ArrivalQueue("one", storage(), () => {});
  q.observe([]);
  q.observe([app("elsewhere")]);
  q.play([]);
  vi.advanceTimersByTime(60_000);
  expect(q.state.pendingArrivalIds).toEqual(["elsewhere"]);
  expect(q.state.newIds).toEqual([]);
});
