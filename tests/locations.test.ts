import { describe, expect, it } from "vitest";
import {
  applicationScene,
  availableScenes,
  cityCoordinates,
  customCitySchema,
  geographicGroups,
  registerCities,
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
    expect(scenesForLocation("Portland, OR")).toEqual(["portland"]);
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

it("every catalog city has coordinates and an alias pattern that does not claim another city", () => {
  const cities = sceneIds.filter((id) => id !== "neutral" && id !== "remote");
  expect(cities.length).toBeGreaterThanOrEqual(64);
  const labels = new Set<string>();
  for (const id of cities) {
    expect(cityCoordinates[id], id).toBeDefined();
    const [lon, lat] = cityCoordinates[id]!;
    expect(Math.abs(lon)).toBeLessThanOrEqual(180);
    expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    expect(sceneCatalog[id].match, id).toBeDefined();
    expect(labels.has(sceneCatalog[id].label), id).toBe(false);
    labels.add(sceneCatalog[id].label);
    // A city's own label must match itself and no other city's pattern.
    expect(scenesForLocation(sceneCatalog[id].label), id).toContain(id);
    const others = scenesForLocation(sceneCatalog[id].label).filter(
      (x) => x !== id,
    );
    expect(others, `${id} label also matches ${others.join(",")}`).toEqual([]);
  }
  expect(scenesForLocation("Washington, DC")).toEqual(["washington-dc"]);
  expect(scenesForLocation("Arlington, VA")).toEqual(["washington-dc"]);
  expect(scenesForLocation("Seattle, Washington")).toEqual(["seattle"]);
  expect(scenesForLocation("Bengaluru, India")).toEqual(["bangalore"]);
  expect(scenesForLocation("Portland, ME")).toEqual([]);
  expect(scenesForLocation("Dublin, CA")).toEqual([]);
  expect(scenesForLocation("Vancouver, WA")).toEqual([]);
});

it("registers a runtime city that matches its aliases, has coordinates and validates as a theme", () => {
  registerCities([
    {
      id: "boise",
      label: "Boise",
      aliases: ["Boise", "Meridian, ID"],
      lon: -116.202,
      lat: 43.615,
      tint: "#3a4656",
      landmark: "",
      addedBy: "agent",
      addedAt: "2026-09-23T00:00:00.000Z",
    },
  ]);
  try {
    expect(scenesForLocation("Boise, Idaho")).toEqual(["boise"]);
    expect(scenesForLocation("Meridian, ID (hybrid)")).toEqual(["boise"]);
    expect(scenesForLocation("Boisean Street, NYC")).toEqual(["nyc"]);
    expect(cityCoordinates.boise).toEqual([-116.202, 43.615]);
    expect(themeSchema.parse("boise")).toBe("boise");
    expect(sceneCatalog.boise.custom).toBe(true);
    expect(
      geographicGroups([{ id: "a", location: "Boise, ID", theme: "neutral" }]),
    ).toMatchObject([{ id: "boise", label: "Boise", ids: ["a"] }]);
  } finally {
    registerCities([]);
  }
  expect(() => themeSchema.parse("boise")).toThrow();
  expect(scenesForLocation("Boise, Idaho")).toEqual([]);
  expect(() =>
    customCitySchema.parse({
      id: "nyc",
      label: "x",
      aliases: ["x"],
      lon: 0,
      lat: 0,
      addedAt: "2026-09-23T00:00:00.000Z",
    }),
  ).toThrow(/Built-in/);
});
