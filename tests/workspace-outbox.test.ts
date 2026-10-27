import { expect, it } from "vitest";
import { WorkspaceOutbox, type CommandStorage } from "../src/workspaceOutbox";
import type { WorkspaceCommand } from "../shared/workspace";

function storage(): CommandStorage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}
const change: WorkspaceCommand = {
  id: "same-request-id",
  expectedRevision: 8,
  actor: "person",
  channel: "app",
  action: "answer",
  payload: { id: "ownership-question", answer: "I set the review criteria." },
};

it("retains the exact request across reload after delivery becomes uncertain", () => {
  const saved = storage();
  new WorkspaceOutbox("one", saved).stage(change);
  const reloaded = new WorkspaceOutbox("one", saved);
  expect(reloaded.pending).toEqual(change);
  expect(new WorkspaceOutbox("other", saved).pending).toBeNull();
  reloaded.resolve(change.id);
  expect(new WorkspaceOutbox("one", saved).pending).toBeNull();
});

it("will not overwrite an unresolved request or clear it for a different acknowledgment", () => {
  const saved = storage();
  const outbox = new WorkspaceOutbox("one", saved);
  outbox.stage(change);
  expect(() => outbox.stage({ ...change, id: "replacement-id" })).toThrow(
    "previous change",
  );
  outbox.resolve("different-id");
  expect(outbox.pending).toEqual(change);
  outbox.resolve(change.id);
  outbox.stage({ ...change, id: "next-id" });
  expect(outbox.pending?.id).toBe("next-id");
});

it("stops new delivery when the pending journal is corrupt or storage cannot retain it", () => {
  const saved = storage();
  const outbox = new WorkspaceOutbox("one", saved);
  outbox.stage(change);
  saved.setItem(saved.key(0)!, "broken");
  expect(() => outbox.pending).toThrow("could not be recovered");
  expect(() => outbox.stage({ ...change, id: "replacement-id" })).toThrow(
    "could not be recovered",
  );
  const unavailable = { ...storage(), setItem: () => {} };
  expect(() => new WorkspaceOutbox("one", unavailable).stage(change)).toThrow(
    "could not preserve",
  );
});
