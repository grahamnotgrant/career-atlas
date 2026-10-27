import { expect, it } from "vitest";
import {
  shouldAcceptSnapshot,
  type SnapshotVersion,
} from "../src/useWorkspace";

const version = (
  career: number,
  overrides: Partial<SnapshotVersion> = {},
): SnapshotVersion => ({
  workspaceId: "one",
  generation: 3,
  view: { revision: 7 },
  career: { revision: career },
  ...overrides,
});

it("does not replace newer career stream state with a delayed command readback", () => {
  const streamed = version(12);
  const delayed = version(11);
  expect(shouldAcceptSnapshot(streamed, delayed)).toBe(false);
  expect(shouldAcceptSnapshot(streamed, version(13))).toBe(true);
});

it("keeps every independent revision monotonic even when another revision advances", () => {
  const current = version(12, { workspace: { revision: 4 } });
  expect(
    shouldAcceptSnapshot(
      current,
      version(13, { generation: 2, workspace: { revision: 5 } }),
    ),
  ).toBe(false);
  expect(
    shouldAcceptSnapshot(
      current,
      version(13, { view: { revision: 6 }, workspace: { revision: 5 } }),
    ),
  ).toBe(false);
  expect(
    shouldAcceptSnapshot(current, version(13, { workspace: { revision: 3 } })),
  ).toBe(false);
  expect(shouldAcceptSnapshot(current, version(13))).toBe(false);
  expect(
    shouldAcceptSnapshot(
      version(0, { workspace: { revision: 0 } }),
      version(0),
    ),
  ).toBe(false);
  expect(
    shouldAcceptSnapshot(current, version(13, { workspace: { revision: 5 } })),
  ).toBe(true);
});

it("loads a replacement workspace but ignores requests issued before that replacement", () => {
  const original = version(12);
  const replacement = version(0, {
    workspaceId: "two",
    generation: 0,
    view: { revision: 0 },
  });
  expect(shouldAcceptSnapshot(original, replacement)).toBe(true);
  expect(shouldAcceptSnapshot(original, replacement, original)).toBe(true);
  expect(shouldAcceptSnapshot(replacement, original, original)).toBe(false);
  expect(shouldAcceptSnapshot(null, original)).toBe(true);
  expect(
    shouldAcceptSnapshot(
      version(0),
      version(0, { workspace: { revision: 1 } }),
    ),
  ).toBe(true);
});
