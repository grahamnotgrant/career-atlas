import { useMemo } from "react";
import type { Application } from "../shared/model";
import { weeklyCadence } from "./journey";

const WEEKS = 12;
/** What went out each week against what came back, as two bars per week. */
export function Cadence({ applications }: { applications: Application[] }) {
  const rows = useMemo(
    () => weeklyCadence(applications, WEEKS),
    [applications],
  );
  const peak = Math.max(1, ...rows.flatMap((r) => [r.applied, r.responses]));
  const applied = rows.reduce((n, r) => n + r.applied, 0),
    responses = rows.reduce((n, r) => n + r.responses, 0);
  if (!applied && !responses) return null;
  const width = 10,
    gap = 3,
    height = 24;
  return (
    <figure
      className="cadence"
      aria-label={`Last ${WEEKS} weeks: ${applied} applications sent, ${responses} responses received`}
    >
      <svg
        viewBox={`0 0 ${rows.length * (width + gap)} ${height}`}
        width={rows.length * (width + gap)}
        height={height}
        aria-hidden="true"
      >
        {rows.map((r, i) => {
          const x = i * (width + gap);
          const sent = (r.applied / peak) * height,
            back = (r.responses / peak) * height;
          return (
            <g key={r.week}>
              <title>
                Week of {r.week}: {r.applied} sent, {r.responses} responses
              </title>
              <rect
                className="cadence-sent"
                x={x}
                y={height - sent}
                width={width / 2}
                height={sent}
              />
              <rect
                className="cadence-back"
                x={x + width / 2}
                y={height - back}
                width={width / 2}
                height={back}
              />
            </g>
          );
        })}
      </svg>
      <figcaption>
        {WEEKS} wk · <b className="cadence-sent">{applied} sent</b> ·{" "}
        <b className="cadence-back">{responses} back</b>
      </figcaption>
    </figure>
  );
}
