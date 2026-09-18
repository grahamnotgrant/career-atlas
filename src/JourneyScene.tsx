import { motion } from "motion/react";
import { useMemo, useState, useEffect, type ReactNode } from "react";
import type { Application, Outcome, View } from "../shared/model";
import {
  center,
  connectionPoint,
  hubs,
  pools,
  journeys,
  polar,
  stageStats,
  unknownStage,
  lastStage,
  visibleJourneys,
  selectionMembers,
  ribbonPath,
  ribbonWidth,
  fallSamples,
  remoteRestriction,
  outcomeOf,
  placeConversion,
  isStale,
  type Point,
  type Selection,
} from "./journey";
import { StagePanel } from "./StagePanel";
import type { PlaceSignal } from "./Globe";
type Trace = Selection | { kind: "application"; id: string };
export interface Place {
  id: string;
  label: string;
  ids: string[];
}
/** What the backdrop needs to show a selection on the globe. */
export interface SceneSelection {
  highlightedIds: ReadonlySet<string> | null;
  ribbons: { origin: Point; color: string } | null;
  emphasisId: string | null;
  /** Lit from the satellite to the city a remote role is restricted to. */
  uplink: { origin: Point; place: string } | null;
  signals: ReadonlyMap<string, PlaceSignal> | null;
}
/* With a stage selected, the outcome orbs count only that stage's
   applications: those still there are awaiting its response, the others
   ended there. A few of each fall into their orb so the funnel reads as
   motion rather than a number. */
const DROPS_PER_ORB = 8;
const DROP_SECONDS = 1.05;
/* Remote has no map coordinate. One satellite just off the globe's edge stands
   for it, on the side the panel leaves free. */
const SATELLITE_POINT = polar(172, 335);
export function JourneyScene({
  applications,
  places,
  view,
  moving,
  newIds,
  onSelect,
  onPlace,
  onSelection,
  onCloseSilent,
  query,
  background,
  suppressDetails = false,
}: {
  applications: Application[];
  places: Place[];
  view: View;
  moving: boolean;
  newIds: string[];
  onSelect: (id: string) => void;
  onPlace: (id: string) => void;
  /** The selection lives in the shared view so it survives refresh and agents can set it. */
  onSelection: (selection: Selection | null) => void;
  onCloseSilent: (ids: string[]) => void;
  query: string;
  background: (selection: SceneSelection) => ReactNode;
  suppressDetails?: boolean;
}) {
  const city = view.theme !== "neutral" && view.theme !== "remote";
  const drawing = useMemo(
    () => visibleJourneys(applications, view.selectedId),
    [applications, view.selectedId],
  );
  const paths = useMemo(() => journeys(drawing.shown, city), [drawing, city]);
  const appIndex = useMemo(
    () => new Map(applications.map((a) => [a.id, a])),
    [applications],
  );
  const selection = view.selection;
  const [emphasisId, setEmphasisId] = useState<string | null>(null);
  useEffect(() => setEmphasisId(null), [selection?.kind, selection?.id]);
  // An open application takes the scene; the selection waits underneath it.
  const shown = view.selectedId ? null : selection;
  const trace: Trace | null =
    shown ??
    (view.selectedId
      ? { kind: "application" as const, id: view.selectedId }
      : null);
  /* A stage traces everyone who reached it; its ribbons and panel follow the
     applications that are there now. */
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
  const located = useMemo(
    () =>
      shown
        ? new Set(selectionMembers(applications, shown).map((a) => a.id))
        : null,
    [applications, shown],
  );
  const reached = new Set(
    members.flatMap((a) => a.events.flatMap((e) => (e.stage ? [e.stage] : []))),
  );
  const last = new Set(members.filter((a) => !unknownStage(a)).map(lastStage));
  const selectedPoint = shown ? connectionPoint(shown.id, city) : null;
  const remote = places.find((place) => place.id === "remote");
  const remoteCount = remote
    ? located
      ? remote.ids.filter((id) => located.has(id)).length
      : remote.ids.length
    : 0;
  /* Response-rate bands describe each place at rest; under a selection each
     place also carries how much of its share has gone silent. */
  const signals = useMemo(() => {
    const map = new Map<string, PlaceSignal>();
    for (const row of placeConversion(places, applications)) {
      const held = located
        ? row.ids.flatMap((id) =>
            located.has(id) && appIndex.has(id) ? [appIndex.get(id)!] : [],
          )
        : [];
      map.set(row.id, {
        band: row.band,
        stale: held.length
          ? held.filter((a) => isStale(a)).length / held.length
          : 0,
      });
    }
    return map;
  }, [places, applications, located, appIndex]);
  const stage =
    shown?.kind === "stage" ? stageStats(applications, shown.id) : null;
  const buckets = stage
    ? new Map(
        pools.map((pool) => [
          pool.id as Outcome,
          pool.id === "pending" || pool.id === "noreply"
            ? stage.current.filter(
                (a) => isStale(a) === (pool.id === "noreply"),
              )
            : stage.ended.filter(
                (a) => a.status === pool.id && lastStage(a) === shown!.id,
              ),
        ]),
      )
    : null;
  const drops =
    buckets && shown!.id !== "applied"
      ? [...buckets].flatMap(([target, apps]) =>
          [...apps]
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice(0, DROPS_PER_ORB)
            .map((a) => ({ id: a.id, target })),
        )
      : [];
  const restrictedTo = remoteRestriction(
    appIndex.get(emphasisId ?? view.selectedId ?? ""),
  );
  function control(target: Selection) {
    const toggle = () =>
      onSelection(
        selection?.kind === target.kind && selection.id === target.id
          ? null
          : target,
      );
    return {
      "aria-pressed":
        selection?.kind === target.kind && selection.id === target.id,
      onClick: toggle,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
        if (e.key === "Escape") onSelection(null);
      },
    };
  }
  return (
    <div className="journey-shell" data-selection={selection?.id ?? "none"}>
      <div
        className={`journey-viewport ${city ? "city-journeys" : "globe-journeys"}`}
        data-layout={city ? "city" : "globe"}
        data-motion={moving ? "on" : "off"}
      >
        <div className="scene-geometry">
          {background({
            highlightedIds: located ?? (trace ? ids : null),
            ribbons:
              !city && shown && selectedPoint
                ? { origin: selectedPoint, color: selectedPoint.color }
                : null,
            emphasisId,
            uplink:
              !city && remote && restrictedTo
                ? { origin: SATELLITE_POINT, place: restrictedTo }
                : null,
            signals,
          })}
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
              <radialGradient id="orb-depth" cx="35%" cy="25%" r="75%">
                <stop offset="0" stopColor="#ffffff" stopOpacity=".22" />
                <stop offset=".45" stopColor="#ffffff" stopOpacity=".04" />
                <stop offset="1" stopColor="#010813" stopOpacity=".55" />
              </radialGradient>
              <filter id="rim-glow">
                <feGaussianBlur stdDeviation="4" />
              </filter>
              <linearGradient id="satellite-body" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#f6f8fc" />
                <stop offset=".55" stopColor="#aab4c4" />
                <stop offset="1" stopColor="#5d6878" />
              </linearGradient>
              <linearGradient id="satellite-panel" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#2c4a9c" />
                <stop offset="1" stopColor="#0f1d47" />
              </linearGradient>
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
            {!city && remote && shown && selectedPoint && remoteCount > 0 && (
              <g
                className="city-ribbon remote-ribbon"
                data-ribbon="remote"
                data-count={remoteCount}
                data-emphasis-self={emphasisId === null ? undefined : "off"}
                data-emphasis={
                  emphasisId === null
                    ? undefined
                    : remote.ids.includes(emphasisId)
                      ? "on"
                      : "off"
                }
                style={
                  {
                    color: selectedPoint.color,
                    "--stale": signals.get("remote")?.stale ?? 0,
                  } as React.CSSProperties
                }
                aria-hidden="true"
              >
                {(() => {
                  const d = ribbonPath(
                      selectedPoint,
                      SATELLITE_POINT,
                      center,
                      true,
                    ),
                    width = ribbonWidth(remoteCount);
                  return (
                    <>
                      <path
                        className="ribbon-halo"
                        d={d}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={width + 8}
                        strokeOpacity=".12"
                        filter="url(#rim-glow)"
                      />
                      <path
                        className="ribbon-body"
                        d={d}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={width}
                        strokeOpacity=".5"
                        strokeLinecap="round"
                        pointerEvents="stroke"
                      >
                        <title>Remote · {remoteCount}</title>
                      </path>
                      {moving && (
                        <path
                          className="flow-light ribbon-light"
                          d={d}
                          fill="none"
                          stroke="#f2f7ff"
                          strokeWidth={Math.min(2.5, width)}
                          strokeOpacity=".8"
                          strokeLinecap="round"
                          pathLength="100"
                          strokeDasharray="3 97"
                        />
                      )}
                    </>
                  );
                })()}
              </g>
            )}
            {!city && remote && (
              <g
                className="remote-satellite"
                role="button"
                tabIndex={0}
                aria-label={`Remote · anywhere · ${remote.ids.length}`}
                data-band={signals.get("remote")?.band}
                data-relevance={
                  located === null
                    ? "all"
                    : remoteCount
                      ? "related"
                      : "unrelated"
                }
                style={{ opacity: located === null || remoteCount ? 1 : 0.3 }}
                onClick={() => onPlace("remote")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPlace("remote");
                  }
                }}
              >
                <circle
                  cx={SATELLITE_POINT.x}
                  cy={SATELLITE_POINT.y}
                  r="30"
                  fill="transparent"
                />
                <g
                  transform={`translate(${SATELLITE_POINT.x} ${SATELLITE_POINT.y})`}
                >
                  <g className="satellite-drift">
                    <circle
                      className="satellite-glow"
                      r="21"
                      fill="#8f8bff"
                      opacity=".16"
                      filter="url(#rim-glow)"
                    />
                    <circle
                      className="satellite-pulse"
                      r="12"
                      fill="none"
                      stroke="#a9a4ff"
                      strokeWidth="1"
                    />
                    <g transform="rotate(-24)">
                      {[-1, 1].map((side) => (
                        <g key={side} transform={`translate(${side * 19} 0)`}>
                          <path
                            d="M-10 -6.5 L10 -4.5 L10 6.5 L-10 4.5 Z"
                            transform={side < 0 ? "scale(-1 1)" : undefined}
                            fill="url(#satellite-panel)"
                            stroke="#6f8be0"
                            strokeWidth=".6"
                          />
                          <path
                            d="M-3.3 -5.8 V5.2 M3.3 -5.2 V5.8 M-10 -1 L10 1"
                            transform={side < 0 ? "scale(-1 1)" : undefined}
                            stroke="#5670c4"
                            strokeWidth=".5"
                            opacity=".7"
                          />
                        </g>
                      ))}
                      <path d="M-9 0 H9" stroke="#c9d0dc" strokeWidth="1.4" />
                      <rect
                        x="-6.5"
                        y="-8"
                        width="13"
                        height="16"
                        rx="2.5"
                        fill="url(#satellite-body)"
                        stroke="#eef2f8"
                        strokeWidth=".5"
                      />
                      <path
                        d="M-6.5 3 H6.5"
                        stroke="#4b5666"
                        strokeWidth=".6"
                        opacity=".7"
                      />
                      <path d="M0 -8 V-13" stroke="#dfe5ee" strokeWidth="1" />
                      <path
                        d="M-4.5 -14.5 Q0 -10.5 4.5 -14.5"
                        fill="none"
                        stroke="#eef2f8"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                      />
                    </g>
                  </g>
                </g>
                <text
                  x={SATELLITE_POINT.x - 42}
                  y={SATELLITE_POINT.y - 2}
                  textAnchor="end"
                  className="pool-label"
                  fill="#c7c4ff"
                >
                  Remote
                </text>
                <text
                  x={SATELLITE_POINT.x - 42}
                  y={SATELLITE_POINT.y + 20}
                  textAnchor="end"
                  className="satellite-count"
                  fill="#c7c4ff"
                >
                  {remoteCount}
                </text>
              </g>
            )}
            {moving &&
              selectedPoint &&
              drops.map((drop, index) => {
                const to = connectionPoint(drop.target, city);
                const samples = fallSamples(selectedPoint, to);
                const delay = 0.3 + index * 0.12;
                return (
                  <g
                    key={`${shown!.id}-${drop.id}`}
                    className="stage-drop"
                    data-drop={drop.target}
                    pointerEvents="none"
                    aria-hidden="true"
                  >
                    {/* Two trailing dots lag the head so the fall reads as speed. */}
                    {[
                      { r: 5, lag: 0, opacity: 1, stroke: "#f4f7ff" },
                      { r: 3.5, lag: 0.05, opacity: 0.5, stroke: "none" },
                      { r: 2.5, lag: 0.1, opacity: 0.25, stroke: "none" },
                    ].map((dot) => (
                      <motion.circle
                        key={dot.r}
                        r={dot.r}
                        fill={to.color}
                        stroke={dot.stroke}
                        strokeWidth="1"
                        initial={{
                          cx: samples[0].x,
                          cy: samples[0].y,
                          opacity: 0,
                        }}
                        animate={{
                          cx: samples.map((s) => s.x),
                          cy: samples.map((s) => s.y),
                          opacity: samples.map((_, i) =>
                            i === 0 || i === samples.length - 1
                              ? 0
                              : dot.opacity,
                          ),
                        }}
                        transition={{
                          duration: DROP_SECONDS,
                          delay: delay + dot.lag,
                          ease: "linear",
                        }}
                      />
                    ))}
                    <motion.circle
                      cx={to.x}
                      cy={to.y}
                      r="14"
                      fill="none"
                      stroke={to.color}
                      strokeWidth="1.5"
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: [0, 0.7, 0], scale: [0.7, 1, 2] }}
                      transition={{
                        duration: 0.6,
                        delay: delay + DROP_SECONDS * 0.92,
                      }}
                      style={{ transformOrigin: `${to.x}px ${to.y}px` }}
                    />
                  </g>
                );
              })}
            {pools.map((pool) => {
              const group = (
                  buckets?.get(pool.id) ??
                  applications.filter((a) => outcomeOf(a) === pool.id)
                ).map((a) => a.id),
                p = connectionPoint(pool.id, city),
                label = city
                  ? { x: p.x, y: p.y + 43 }
                  : polar(
                      pool.angle,
                      pool.id === "rejected" || pool.id === "noreply"
                        ? 335
                        : 357,
                    );
              const active =
                !trace ||
                (buckets
                  ? group.length > 0
                  : members.some((a) => outcomeOf(a) === pool.id));
              return (
                <g
                  key={pool.id}
                  className="outcome-pool rim-outcome"
                  role="button"
                  tabIndex={0}
                  style={{ color: pool.color, opacity: active ? 1 : 0.2 }}
                  aria-label={`${pool.label}: ${group.length} applications`}
                  data-selected={selection?.id === pool.id ? "true" : undefined}
                  {...control({ kind: "outcome", id: pool.id })}
                >
                  <circle
                    className="orb-halo"
                    cx={p.x}
                    cy={p.y}
                    r="27"
                    fill="currentColor"
                    opacity={group.length ? 0.12 : 0}
                    filter="url(#rim-glow)"
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="20"
                    fill="#0a1425"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="18"
                    fill="currentColor"
                    opacity={group.length ? 0.2 : 0.03}
                  />
                  <circle cx={p.x} cy={p.y} r="18" fill="url(#orb-depth)" />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="7"
                    fill="currentColor"
                    opacity={group.length ? 0.85 : 0.18}
                  />
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
              const a = appIndex.get(p.id)!;
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
                  {view.selectedId === a.id && (
                    <g
                      className="application-node"
                      role="button"
                      tabIndex={0}
                      aria-label={`Inspect ${a.company}: ${a.title}`}
                      onClick={() => onSelect(a.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(a.id);
                        }
                      }}
                    >
                      <rect
                        x={p.end.x - 10}
                        y={p.end.y - 15}
                        width="210"
                        height="28"
                        rx="6"
                        fill="#091322"
                        fillOpacity=".96"
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
                  {view.selectedId === a.id && (
                    <text
                      x={p.end.x + 15}
                      y={p.end.y + 5}
                      className="application-label"
                    >
                      {a.company.length > 24
                        ? a.company.slice(0, 23).trimEnd() + "…"
                        : a.company}
                      <title>
                        {a.company}
                        {unknownStage(a) ? " · stage unknown" : ""}
                      </title>
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
                  data-selected={selection?.id === hub.id ? "true" : undefined}
                  {...control({ kind: "stage", id: hub.id })}
                >
                  <circle cx={p.x} cy={p.y} r="24" fill="transparent" />
                  <circle
                    className="orb-halo"
                    cx={p.x}
                    cy={p.y}
                    r="25"
                    fill="currentColor"
                    opacity={
                      stats.current.length
                        ? Math.min(
                            0.2,
                            0.07 + Math.log2(stats.current.length + 1) * 0.02,
                          )
                        : 0
                    }
                    filter="url(#rim-glow)"
                  />
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
                    r="16"
                    fill="currentColor"
                    opacity={stats.current.length ? 0.18 : 0.025}
                  />
                  <circle cx={p.x} cy={p.y} r="16" fill="url(#orb-depth)" />
                  <text
                    x={p.x}
                    y={p.y + 4}
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize={group.length > 999 ? 10 : 12}
                    fontWeight="600"
                    className="orb-number"
                  >
                    {group.length}
                  </text>
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
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      {!suppressDetails && shown && selectedPoint && (
        <StagePanel
          selection={shown}
          applications={applications}
          places={places}
          color={selectedPoint.color}
          onSelect={onSelect}
          onPlace={onPlace}
          onEmphasis={setEmphasisId}
          onClose={() => onSelection(null)}
          onCloseSilent={onCloseSilent}
        />
      )}
    </div>
  );
}
