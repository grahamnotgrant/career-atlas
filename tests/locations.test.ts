import { describe, expect, it } from "vitest";
import {
  applicationScene,
  availableScenes,
  scenesForLocation,
  sceneCatalog,
  sceneIds,
} from "../shared/locations";
import { themeSchema } from "../shared/model";
describe("application location scenes", () => {
  it.each([
    ["Remote US (SF hybrid preferred)", "remote"],
    ["NYC, hybrid", "nyc"],
    ["Los Angeles, CA", "la"],
    ["San Diego, CA", "san-diego"],
    ["Chicago", "chicago"],
    ["Miami Beach", "miami"],
    ["Seattle, WA", "seattle"],
    ["Dallas, TX", "dallas"],
    ["Bellevue, WA", "seattle"],
    ["London, UK", "london"],
    ["Toronto", "toronto"],
    ["Paris, France", "paris"],
    ["Sydney, Australia", "sydney"],
    ["Denver", "denver"],
    ["Boston", "boston"],
    ["Austin", "austin"],
    ["Atlanta", "atlanta"],
  ])("resolves %s despite an older neutral import", (location, scene) => {
    expect(applicationScene({ location, theme: "neutral" })).toBe(scene);
  });
  it("deduplicates applied cities, supports multiple offices and excludes unrelated cities", () => {
    expect(
      availableScenes([
        { location: "Remote / New York / San Diego", theme: "neutral" },
        { location: "NYC", theme: "nyc" },
        { location: "Miami", theme: "neutral" },
      ]),
    ).toEqual(["remote", "miami", "nyc", "san-diego"]);
    expect(availableScenes([])).toEqual([]);
    expect(scenesForLocation("Portland, OR")).toEqual([]);
    expect(scenesForLocation("Platform Engineer, US")).toEqual([]);
    expect(
      applicationScene({ location: "Unspecified", theme: "chicago" }),
    ).toBe("chicago");
  });
  it("accepts every catalog entry and supplies a unique landmark description", () => {
    expect(sceneCatalog.remote.landmark).toBe(sceneCatalog.neutral.landmark);
    for (const id of sceneIds) expect(themeSchema.parse(id)).toBe(id);
  });
});
