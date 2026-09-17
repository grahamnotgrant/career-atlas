import { motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import type { Application, Stage, Status, View } from "../shared/model";
import { stageLabels, statusLabels } from "../shared/model";
import {
  connections,
  connectionPoint,
  hubs,
  pools,
  journeys,
  polar,
  stageStats,
  outcomeBreakdown,
  currentStage,
  unknownStage,
  lastStage,
} from "./journey";
type Trace =
  | { kind: "stage"; id: Stage }
  | { kind: "outcome"; id: Status }
  | { kind: "application"; id: string };
export function JourneyScene({
  applications,
  view,
  moving,
  newIds,
  onSelect,
  onGroup,
  query,
  background,
}: {
  applications: Application[];
  view: View;
  moving: boolean;
  newIds: string[];
  onSelect: (id: string) => void;
  onGroup: (ids: string[]) => void;
  query: string;
  background: ReactNode;
}) {
  const city = view.theme !== "neutral" && view.theme !== "remote";
  const edges = useMemo(() => connections(applications), [applications]);
  const paths = useMemo(
    () => journeys(applications, city),
    [applications, city],
  );
  const [hover, setHover] = useState<Trace | null>(null),
    [focus, setFocus] = useState<Trace | null>(null);
  const trace =
    hover ??
    focus ??
    (view.selectedId
      ? { kind: "application" as const, id: view.selectedId }
      : null);
  const members = trace
    ? applications.filter((a) =>
        trace.kind === "application"
          ? a.id === trace.id
          : trace.kind === "outcome"
            ? a.status === trace.id
            : a.events.some((e) => e.stage === trace.id),
      )
    : [];
  const ids = new Set(members.map((a) => a.id));
  const reached = new Set(
    members.flatMap((a) => a.events.flatMap((e) => (e.stage ? [e.stage] : []))),
  );
  const last = new Set(members.filter((a) => !unknownStage(a)).map(lastStage));
  function interaction(target: Trace, click: () => void) {
    return {
      onMouseEnter: () => setHover(target),
      onMouseLeave: () => setHover(null),
      onFocus: () => setFocus(target),
      onBlur: () => setFocus(null),
      onClick: click,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          click();
        }
        if (e.key === "Escape") {
          setHover(null);
          setFocus(null);
        }
      },
    };
  }
  const stage =
    trace?.kind === "stage" ? stageStats(applications, trace.id) : null;
  const app = trace?.kind === "application" ? members[0] : null;
  return (
    <div
      className={`journey-viewport ${city ? "city-journeys" : "globe-journeys"}`}
      data-layout={city ? "city" : "globe"}
      data-motion={moving ? "on" : "off"}
    >
      <div className="scene-geometry">
        {background}
        <svg
          className="journey-scene"
          viewBox="0 0 1350 800"
          role="group"
          aria-label={
            city
              ? "Applications in the city. Hiring stages above the skyline, outcomes below."
              : "Application journeys. Status groups surround the globe; their positions do not represent locations."
          }
        >
          <defs>
            <filter id="rim-glow">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>
          {!city && (
            <circle
              className="status-rim"
              cx="675"
              cy="390"
              r="257"
              fill="none"
              stroke="#283a51"
              strokeWidth="1"
              aria-hidden="true"
            />
          )}
          {city && (
            <path
              className="city-process-rail"
              d="M175 155 H1175"
              stroke="#2b3d54"
              strokeWidth="1"
              aria-hidden="true"
            />
          )}
          {newIds.flatMap((id, index) => {
            const application = applications.find((a) => a.id === id);
            // Only submitted applications waiting for a reply follow this route.
            if (!application || application.status !== "pending") return [];
            const from = connectionPoint("applied", city);
            const to = connectionPoint("pending", city);
            return [
              <g
                key={id}
                className="application-arrival"
                data-arrival={id}
                aria-hidden="true"
                pointerEvents="none"
              >
                {moving ? (
                  <motion.circle
                    className="arrival-particle"
                    r="7"
                    fill="#c1cfff"
                    stroke="#f0f6ff"
                    strokeWidth="1.5"
                    initial={{ cx: from.x, cy: from.y - 65, opacity: 0 }}
                    animate={{
                      cx: [from.x, from.x, from.x, to.x, to.x],
                      cy: [from.y - 65, from.y, from.y, to.y, to.y],
                      opacity: [0, 1, 1, 1, 0],
                    }}
                    transition={{
                      duration: 2.6,
                      delay: Math.min(index * 0.08, 0.48),
                      times: [0, 0.22, 0.36, 0.85, 1],
                      ease: "easeInOut",
                    }}
                  />
                ) : null}
                <motion.circle
                  className="arrival-applied-pulse"
                  cx={from.x}
                  cy={from.y}
                  r="25"
                  fill="none"
                  stroke="#9ec5ff"
                  strokeWidth="2"
                  initial={{ opacity: 0, scale: 1 }}
                  animate={
                    moving
                      ? { opacity: [0, 0.9, 0], scale: [1, 1.35, 1.65] }
                      : { opacity: [0, 0.65, 0] }
                  }
                  transition={{
                    delay: moving ? 0.55 : 0,
                    duration: moving ? 0.65 : 1.2,
                  }}
                  style={{ transformOrigin: `${from.x}px ${from.y}px` }}
                />
                <motion.circle
                  className="arrival-pending-pulse"
                  cx={to.x}
                  cy={to.y}
                  r="27"
                  fill="none"
                  stroke="#c3a8ff"
                  strokeWidth="2"
                  initial={{ opacity: 0, scale: 1 }}
                  animate={
                    moving
                      ? { opacity: [0, 0.9, 0], scale: [1, 1.35, 1.65] }
                      : { opacity: [0, 0.65, 0] }
                  }
                  transition={{
                    delay: moving ? 2.1 : 0,
                    duration: moving ? 0.75 : 1.2,
                  }}
                  style={{ transformOrigin: `${to.x}px ${to.y}px` }}
                />
              </g>,
            ];
          })}
          {edges.map((edge) => {
            const from = connectionPoint(edge.from, city),
              to = connectionPoint(edge.to, city);
            const highlighted = !!trace && edge.ids.some((id) => ids.has(id));
            const progressed =
              hubs.some((h) => h.id === edge.to) && edge.to !== "applied";
            const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
            const selected = trace?.kind === "application";
            return (
              <g
                key={edge.id}
                className="connection"
                data-connection={edge.id}
                data-count={edge.ids.length}
                style={{
                  opacity:
                    (view.selectedId || view.flowIds) && highlighted ? 1 : 0,
                }}
                pointerEvents="none"
              >
                <path
                  d={`M${from.x} ${from.y} L${to.x} ${to.y}`}
                  stroke="#050e1c"
                  strokeWidth="8"
                />
                <path
                  d={`M${from.x} ${from.y} L${to.x} ${to.y}`}
                  stroke={to.color}
                  strokeWidth={highlighted || progressed ? 2.5 : 1.5}
                  strokeOpacity={highlighted || progressed ? 0.95 : 0.55}
                  strokeDasharray={edge.uncertain ? "6 5" : undefined}
                />
                {moving && progressed && !selected && (
                  <path
                    className="flow-light"
                    d={`M${from.x} ${from.y} L${to.x} ${to.y}`}
                    stroke={to.color}
                    strokeWidth="3"
                    pathLength="100"
                    strokeDasharray="1 45"
                  />
                )}
                <rect
                  x={mid.x - 16}
                  y={mid.y - 12}
                  width="32"
                  height="24"
                  rx="10"
                  fill="#0a1526"
                  stroke={to.color}
                  strokeOpacity=".4"
                />
                <text
                  x={mid.x}
                  y={mid.y + 5}
                  textAnchor="middle"
                  className="connection-count"
                >
                  {edge.ids.length}
                </text>
              </g>
            );
          })}
          {pools.map((pool) => {
            const group = applications
                .filter((a) => a.status === pool.id)
                .map((a) => a.id),
              p = connectionPoint(pool.id, city),
              label = city
                ? { x: p.x, y: p.y + 43 }
                : polar(pool.angle, pool.id === "rejected" ? 335 : 357);
            const active = !trace || members.some((a) => a.status === pool.id);
            return (
              <g
                key={pool.id}
                className="outcome-pool rim-outcome"
                role="button"
                tabIndex={0}
                style={{ color: pool.color, opacity: active ? 1 : 0.2 }}
                aria-label={`${pool.label}: ${group.length} applications`}
                {...interaction({ kind: "outcome", id: pool.id }, () =>
                  onGroup(group),
                )}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="20"
                  fill="#0a1425"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <circle cx={p.x} cy={p.y} r="9" fill="currentColor" />
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor={
                    !city && pool.id === "pending"
                      ? "end"
                      : !city && pool.id === "closed"
                        ? "start"
                        : "middle"
                  }
                  className="pool-label"
                >
                  {pool.label}
                </text>
                <text
                  x={label.x}
                  y={label.y + 29}
                  textAnchor={
                    !city && pool.id === "pending"
                      ? "end"
                      : !city && pool.id === "closed"
                        ? "start"
                        : "middle"
                  }
                  className="rim-total"
                >
                  {group.length}
                </text>
              </g>
            );
          })}
          {paths.map((p) => {
            const a = applications.find((a) => a.id === p.id)!;
            const matches =
              (!query ||
                `${a.company} ${a.title} ${a.location}`
                  .toLowerCase()
                  .includes(query.toLowerCase())) &&
              (view.status === "all" || a.status === view.status) &&
              (!view.flowIds || view.flowIds.includes(a.id));
            const bright = !!trace && ids.has(a.id) && matches;
            return (
              <g
                key={p.id}
                className={`journey ${newIds.includes(p.id) ? "new-arrival" : ""}`}
                data-application={a.id}
                data-highlighted={bright ? "true" : "false"}
                style={{ opacity: 1 }}
              >
                <g
                  className="trace-path"
                  opacity={view.selectedId === a.id ? 1 : 0}
                  pointerEvents="none"
                >
                  <path
                    d={p.path}
                    stroke={p.color}
                    strokeWidth="3"
                    opacity=".12"
                    filter="url(#rim-glow)"
                  />
                  <path
                    d={p.path}
                    stroke={p.color}
                    className="journey-thread"
                    strokeWidth="1.8"
                    strokeDasharray={p.uncertain ? "5 5" : undefined}
                  />
                  {moving && bright && (
                    <path
                      d={p.path}
                      stroke="#fff"
                      strokeWidth="2"
                      pathLength="100"
                      strokeDasharray=".3 25"
                      className="flow-light"
                    />
                  )}
                  {(trace?.kind === "application" ? p.stages : []).map(
                    (s, i) => {
                      const at = connectionPoint(s, city);
                      return (
                        <circle
                          key={`${s}-${i}`}
                          cx={at.x}
                          cy={at.y}
                          r="23"
                          fill="none"
                          stroke={p.color}
                          strokeWidth="1"
                        />
                      );
                    },
                  )}
                </g>
                {(a.status === "interview" ||
                  a.status === "offer" ||
                  view.selectedId === a.id) && (
                  <g
                    className="application-node"
                    role="button"
                    tabIndex={0}
                    aria-label={`Inspect ${a.company}: ${a.title}`}
                    {...interaction({ kind: "application", id: a.id }, () =>
                      onSelect(a.id),
                    )}
                  >
                    <circle
                      cx={p.end.x}
                      cy={p.end.y}
                      r="10"
                      fill="transparent"
                    />
                    <circle
                      cx={p.end.x}
                      cy={p.end.y}
                      r={
                        bright && trace?.kind === "application"
                          ? 7
                          : a.status === "interview" || a.status === "offer"
                            ? 6
                            : 4
                      }
                      fill={p.color}
                      stroke={
                        bright && trace?.kind === "application"
                          ? "#fff"
                          : "none"
                      }
                      strokeWidth="1.5"
                    />
                    <title>
                      {a.company} · {a.title}
                    </title>
                  </g>
                )}
                {(a.status === "interview" ||
                  a.status === "offer" ||
                  view.selectedId === a.id) && (
                  <text
                    x={p.end.x + 15}
                    y={p.end.y + 5}
                    className="application-label"
                  >
                    {a.company}
                    {unknownStage(a) ? " · stage unknown" : ""}
                  </text>
                )}
              </g>
            );
          })}
          {hubs.map((hub) => {
            const p = connectionPoint(hub.id, city),
              label = city ? { x: p.x, y: p.y - 60 } : polar(hub.angle, 349),
              stats = stageStats(applications, hub.id),
              group = stats.reached.map((a) => a.id);
            return (
              <g
                key={hub.id}
                className="stage-hub"
                role="button"
                tabIndex={0}
                style={{
                  color: hub.color,
                  opacity: !trace || reached.has(hub.id) ? 1 : 0.22,
                }}
                aria-label={`${hub.label}: ${group.length} applications reached`}
                {...interaction({ kind: "stage", id: hub.id }, () =>
                  onGroup(group),
                )}
              >
                <circle cx={p.x} cy={p.y} r="24" fill="transparent" />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="17"
                  fill="#0a1425"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="9"
                  fill="currentColor"
                  opacity={group.length ? 1 : 0.25}
                />
                {trace && last.has(hub.id) && (
                  <circle
                    className="last-confirmed"
                    cx={p.x}
                    cy={p.y}
                    r="26"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                  />
                )}
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor={
                    !city && hub.id === "offer"
                      ? "start"
                      : !city && hub.id === "applied"
                        ? "end"
                        : "middle"
                  }
                  className="hub-label"
                >
                  {hub.label}
                </text>
                <text
                  x={label.x}
                  y={label.y + 20}
                  textAnchor={
                    !city && hub.id === "offer"
                      ? "start"
                      : !city && hub.id === "applied"
                        ? "end"
                        : "middle"
                  }
                  className={
                    hub.id === "applied"
                      ? "hub-count applied-total"
                      : "hub-count"
                  }
                >
                  {hub.id === "applied"
                    ? `${group.length} submitted`
                    : `${stats.current.length} here · ${group.length} reached`}
                </text>
              </g>
            );
          })}
          <text x="675" y="783" textAnchor="middle" className="rim-legend">
            {city
              ? "Select a stage or outcome to explore this collection"
              : "Status groups · Positions are not geographic"}
          </text>
        </svg>
        <aside
          className={`trace-summary ${trace ? "active" : ""}`}
          aria-live="polite"
          aria-atomic="true"
        >
          {!trace ? (
            <>
              <strong>Follow a journey</strong>
              <p>
                Click a stage or outcome to see its connections. Select an
                application to follow its recorded path.
              </p>
            </>
          ) : app ? (
            <>
              <strong>{app.company}</strong>
              <p>{app.title}</p>
              <p>
                {statusLabels[app.status]}
                {currentStage(app)
                  ? ` · ${stageLabels[currentStage(app)!]}`
                  : ""}
              </p>
              {unknownStage(app) && <p>Interview stage unknown</p>}
              <ol>
                {app.events.map((e) => (
                  <li key={e.id}>
                    {e.date ?? "Date unknown"} · {e.label}
                  </li>
                ))}
              </ol>
              <small>Click to pin and open details.</small>
            </>
          ) : stage ? (
            <>
              <strong>{stageLabels[(trace as { id: Stage }).id]}</strong>
              <p>
                {stage.reached.length} reached · {stage.current.length}{" "}
                currently here
              </p>
              <p>{stage.passed.length} passed through to a later stage</p>
              {stage.ended.length > 0 && (
                <p>{stage.ended.length} now rejected or closed</p>
              )}
              {stage.unknown.length > 0 && (
                <p>{stage.unknown.length} with interview stage unknown</p>
              )}
              <small>Hover an application dot for its dated journey.</small>
            </>
          ) : trace?.kind === "outcome" ? (
            <>
              <strong>
                {statusLabels[trace.id]} · {members.length}
              </strong>
              <p>Last confirmed stage</p>
              <ul>
                {outcomeBreakdown(applications, trace.id).map((row) => (
                  <li key={row.label}>
                    {row.label}: {row.count}
                  </li>
                ))}
              </ul>
              {!members.length && <p>No applications in this group.</p>}
              <small>Double rings mark the last confirmed stages.</small>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
