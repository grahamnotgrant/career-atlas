import { afterEach, expect, it, vi } from "vitest";
import { subscribeToTime } from "../src/useNow";

afterEach(() => vi.useRealTimers());

it("refreshes at lease expiry without any workspace writes or source events", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T18:00:00Z"));
  const visibility = Object.assign(new EventTarget(), { hidden: false });
  const update = vi.fn();
  const close = subscribeToTime(["2026-10-27T18:00:02Z"], update, visibility);
  expect(update).toHaveBeenLastCalledWith(Date.parse("2026-10-27T18:00:00Z"));
  vi.advanceTimersByTime(1999);
  expect(update).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(1);
  expect(update).toHaveBeenLastCalledWith(Date.parse("2026-10-27T18:00:02Z"));
  close();
  vi.advanceTimersByTime(60_000);
  expect(update).toHaveBeenCalledTimes(2);
});

it("suspends timers while hidden and recomputes immediately when the person returns", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T18:00:00Z"));
  const visibility = Object.assign(new EventTarget(), { hidden: false });
  const update = vi.fn();
  const close = subscribeToTime(["2026-10-27T18:00:02Z"], update, visibility);
  visibility.hidden = true;
  visibility.dispatchEvent(new Event("visibilitychange"));
  vi.advanceTimersByTime(120_000);
  expect(update).toHaveBeenCalledOnce();
  visibility.hidden = false;
  visibility.dispatchEvent(new Event("visibilitychange"));
  expect(update).toHaveBeenLastCalledWith(Date.parse("2026-10-27T18:02:00Z"));
  close();
  visibility.dispatchEvent(new Event("visibilitychange"));
  vi.advanceTimersByTime(60_000);
  expect(update).toHaveBeenCalledTimes(2);
});

it("keeps visible elapsed-time displays current with no deadlines or malformed dates", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T18:00:00Z"));
  const update = vi.fn();
  const close = subscribeToTime(
    ["invalid", "2026-10-26T00:00:00Z"],
    update,
    Object.assign(new EventTarget(), { hidden: false }),
  );
  vi.advanceTimersByTime(60_000);
  expect(update).toHaveBeenLastCalledWith(Date.parse("2026-10-27T18:01:00Z"));
  close();
});
