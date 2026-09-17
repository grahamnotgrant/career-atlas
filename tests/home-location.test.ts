import { it, expect } from "vitest";
import { inferHome } from "../server/home-location";
it("uses current resume address, excludes relocation and keeps evidence links", () => {
  const home = inferHome([
    {
      evidenceId: "a",
      header:
        "A Person\nDenver, CO | Relocating to New York City | a@example.com",
    },
    {
      evidenceId: "b",
      header:
        "A Person\nDenver, Colorado | a@example.com\nExperience\nSeattle, WA",
    },
  ]);
  expect(home).toEqual({
    status: "resume",
    label: "Denver",
    coordinates: [-104.99, 39.739],
    evidenceIds: ["a", "b"],
  });
});
it("leaves conflicting, missing and unrecognized locations unset", () => {
  expect(
    inferHome([
      { evidenceId: "a", header: "Denver, CO" },
      { evidenceId: "b", header: "New York, NY" },
    ]).status,
  ).toBe("conflict");
  expect(
    inferHome([
      {
        evidenceId: "a",
        header: "Austin Smith\nEngineer\nExperience\nDenver, CO",
      },
    ]).status,
  ).toBe("unset");
  expect(
    inferHome([{ evidenceId: "a", header: "Portland, OR" }]).coordinates,
  ).toBe(null);
  expect(inferHome([]).coordinates).toBe(null);
});
