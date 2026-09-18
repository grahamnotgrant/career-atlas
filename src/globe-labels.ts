export interface CityAnchor {
  id: string;
  x: number;
  y: number;
  width: number;
}
export interface CityLabel extends CityAnchor {
  left: number;
  top: number;
  height: number;
  leaderX: number;
  leaderY: number;
}
export interface LabelBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
/** Place one compact label per visible geographic anchor. Stable ordering and a
 * bounded grid fallback make dense clusters deterministic without hiding cities. */
export function layoutCityLabels(
  anchors: CityAnchor[],
  bounds: LabelBounds,
): CityLabel[] {
  const placed: CityLabel[] = [],
    height = 34,
    gap = 7;
  const overlap = (left: number, top: number, width: number) =>
    placed.some(
      (p) =>
        left < p.left + p.width + gap &&
        left + width + gap > p.left &&
        top < p.top + p.height + gap &&
        top + height + gap > p.top,
    );
  for (const anchor of [...anchors].sort(
    (a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
  )) {
    const width = Math.min(anchor.width, bounds.right - bounds.left);
    const candidates: { left: number; top: number; score: number }[] = [];
    const add = (left: number, top: number) => {
      left = Math.max(bounds.left, Math.min(bounds.right - width, left));
      top = Math.max(bounds.top, Math.min(bounds.bottom - height, top));
      if (!overlap(left, top, width)) {
        const cx = Math.max(left, Math.min(left + width, anchor.x)),
          cy = Math.max(top, Math.min(top + height, anchor.y));
        candidates.push({
          left,
          top,
          score: Math.hypot(cx - anchor.x, cy - anchor.y),
        });
      }
    };
    for (let ring = 0; ring < 10; ring++)
      for (const sign of ring === 0 ? [1] : [-1, 1]) {
        const top = anchor.y - height / 2 + sign * ring * (height + gap);
        add(anchor.x + 14, top);
        add(anchor.x - width - 14, top);
      }
    if (!candidates.length)
      for (
        let top = bounds.top;
        top + height <= bounds.bottom;
        top += height + gap
      )
        for (
          let left = bounds.left;
          left + width <= bounds.right;
          left += width + gap
        )
          add(left, top);
    // The scene has at most sixteen catalog cities and space for many more rows.
    // A caller with a smaller viewport receives an explicit overflow error.
    if (!candidates.length)
      throw new Error("City label bounds cannot fit all labels.");
    candidates.sort(
      (a, b) => a.score - b.score || a.top - b.top || a.left - b.left,
    );
    const { left, top } = candidates[0];
    placed.push({
      ...anchor,
      width,
      left,
      top,
      height,
      leaderX: Math.max(left, Math.min(left + width, anchor.x)),
      leaderY: Math.max(top, Math.min(top + height, anchor.y)),
    });
  }
  return placed;
}
