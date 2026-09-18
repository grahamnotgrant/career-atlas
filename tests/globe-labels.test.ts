import { expect, it } from "vitest";
import { geoOrthographic, geoDistance } from "d3-geo";
import { cityCoordinates, sceneCatalog } from "../shared/locations";
import { layoutCityLabels } from "../src/globe-labels";
const bounds = { left: 440, right: 1160, top: 115, bottom: 790 };
function verify(labels: ReturnType<typeof layoutCityLabels>) {
  for (const a of labels) {
    expect(a.left).toBeGreaterThanOrEqual(bounds.left);
    expect(a.top).toBeGreaterThanOrEqual(bounds.top);
    expect(a.left + a.width).toBeLessThanOrEqual(bounds.right);
    expect(a.top + a.height).toBeLessThanOrEqual(bounds.bottom);
    for (const b of labels)
      if (a.id !== b.id)
        expect(
          a.left < b.left + b.width &&
            a.left + a.width > b.left &&
            a.top < b.top + b.height &&
            a.top + a.height > b.top,
        ).toBe(false);
  }
}
it("keeps all North American city badges separate at the actual globe projection", () => {
  const center: [number, number] = [-105, 40];
  const projection = geoOrthographic()
    .rotate([-center[0], -center[1]])
    .translate([800, 455])
    .scale(340);
  const anchors = Object.entries(cityCoordinates)
    .filter(([, p]) => geoDistance(center, p!) < Math.PI / 2 - 0.08)
    .map(([id, p]) => {
      const [x, y] = projection(p!)!;
      const label = sceneCatalog[id as keyof typeof sceneCatalog].label;
      return { id, x, y, width: label.length * 8.5 + 60 };
    });
  expect(anchors.length).toBeGreaterThan(10);
  verify(layoutCityLabels(anchors, bounds));
  expect(layoutCityLabels(anchors, bounds)).toEqual(
    layoutCityLabels([...anchors].reverse(), bounds),
  );
});
it("handles dense colocated locations and five-digit counts without hiding labels", () => {
  const anchors = Array.from({ length: 16 }, (_, i) => ({
    id: `city-${i}`,
    x: 800,
    y: 455,
    width: 200,
  }));
  const labels = layoutCityLabels(anchors, bounds);
  expect(labels).toHaveLength(16);
  verify(labels);
});
it("keeps labels inside bounds while rotating through every longitude", () => {
  for (let lon = -180; lon < 180; lon += 15) {
    const center: [number, number] = [lon, 30],
      projection = geoOrthographic()
        .rotate([-lon, -30])
        .translate([800, 455])
        .scale(340);
    const anchors = Object.entries(cityCoordinates)
      .filter(([, p]) => geoDistance(center, p!) < Math.PI / 2 - 0.08)
      .map(([id, p]) => {
        const [x, y] = projection(p!)!;
        return {
          id,
          x,
          y,
          width:
            sceneCatalog[id as keyof typeof sceneCatalog].label.length * 8.5 +
            60,
        };
      });
    verify(layoutCityLabels(anchors, bounds));
  }
});
