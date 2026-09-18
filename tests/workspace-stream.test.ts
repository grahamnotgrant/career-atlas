import { afterEach, expect, it, vi } from "vitest";
import { connectWorkspace } from "../src/useWorkspace";
class Stream {
  static opened: Stream[] = [];
  listeners = new Map<string, (event: { data: string }) => void>();
  onerror?: () => void;
  close = vi.fn();
  constructor(public url: string) {
    Stream.opened.push(this);
  }
  addEventListener(name: string, handler: (event: { data: string }) => void) {
    this.listeners.set(name, handler);
  }
  emit(name: string, value: unknown) {
    this.listeners.get(name)?.({ data: JSON.stringify(value) });
  }
}
function setup() {
  vi.useFakeTimers();
  Stream.opened = [];
  vi.stubGlobal("EventSource", Stream);
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetcher);
  const handlers = {
    snapshot: vi.fn(),
    sync: vi.fn(),
    connected: vi.fn(),
    initialError: vi.fn(),
  };
  return { handlers, fetcher };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("loads exactly one initial payload via SSE and preserves reconnect handling", async () => {
  const { handlers, fetcher } = setup();
  const close = connectWorkspace(handlers);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher.mock.calls.map((call) => call[0])).toEqual(["/api/session"]);
  expect(Stream.opened).toHaveLength(1);
  const stream = Stream.opened[0];
  stream.emit("snapshot", { generation: 1 });
  expect(handlers.snapshot).toHaveBeenCalledOnce();
  stream.onerror?.();
  expect(handlers.connected).toHaveBeenLastCalledWith(false);
  stream.emit("snapshot", { generation: 2 });
  expect(handlers.connected).toHaveBeenLastCalledWith(true);
  await vi.advanceTimersByTimeAsync(12_000);
  expect(handlers.initialError).toHaveBeenLastCalledWith("");
  close();
  expect(stream.close).toHaveBeenCalledOnce();
  stream.emit("snapshot", {});
  expect(handlers.snapshot).toHaveBeenCalledTimes(2);
});
it("shows a bounded initial error for a silent stream and recovers on a later snapshot", async () => {
  const { handlers } = setup();
  const close = connectWorkspace(handlers);
  await vi.advanceTimersByTimeAsync(12_000);
  expect(handlers.initialError).toHaveBeenLastCalledWith(
    expect.stringContaining("too long"),
  );
  Stream.opened[0].emit("snapshot", {});
  expect(handlers.initialError).toHaveBeenLastCalledWith("");
  close();
});
it("aborts a stalled session and ignores callbacks after unmount", async () => {
  const { handlers, fetcher } = setup();
  fetcher.mockImplementation(() => new Promise(() => {}));
  const close = connectWorkspace(handlers);
  await vi.advanceTimersByTimeAsync(12_000);
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  expect(handlers.initialError).toHaveBeenCalledOnce();
  close();
  expect(Stream.opened).toHaveLength(0);
});
it("reports malformed initial events and retries without accepting them", async () => {
  const { handlers } = setup();
  const close = connectWorkspace(handlers);
  await vi.advanceTimersByTimeAsync(0);
  Stream.opened[0].listeners.get("snapshot")?.({ data: "invalid JSON" });
  expect(handlers.snapshot).not.toHaveBeenCalled();
  expect(handlers.initialError).toHaveBeenLastCalledWith(
    expect.stringContaining("could not be read"),
  );
  Stream.opened[0].emit("snapshot", {});
  expect(handlers.snapshot).toHaveBeenCalledOnce();
  close();
});

it("does not open a stream when an in-flight session resolves after unmount", async () => {
  const { handlers, fetcher } = setup();
  let finish!: (value: unknown) => void;
  fetcher.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const close = connectWorkspace(handlers);
  close();
  finish({ ok: true, json: async () => ({}) });
  await vi.advanceTimersByTimeAsync(0);
  expect(Stream.opened).toHaveLength(0);
  expect(handlers.initialError).not.toHaveBeenCalled();
});
