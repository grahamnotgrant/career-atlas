import { layoutCityLabels, type CityAnchor } from "./globe-labels";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { animate, useIsPresent, usePresenceData } from "motion/react";
import { geoGraticule10, geoOrthographic, geoPath, geoDistance } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import world from "world-atlas/land-110m.json";
import { cityCoordinates, geographicGroups } from "../shared/locations";
import type { Theme, HomeLocation, Application } from "../shared/model";
import {
  placeCounts,
  ribbonPath,
  ribbonWidth,
  RIBBON_LIMIT,
  type Point,
} from "./journey";
/** Ribbons leave this point, given in the globe's own coordinates. */
export interface GlobeRibbons {
  origin: Point;
  color: string;
}
/** Per-place signals drawn on the marker: response-rate band at rest, and
    the share of a selection that has gone silent. */
export interface PlaceSignal {
  band: "above" | "below" | "none" | "few";
  stale: number;
}
const GLOBE_CENTER = { x: 800, y: 455 };
const topology = world as unknown as Topology<{ land: GeometryCollection }>;
const land = feature(topology, topology.objects.land);
const grid = geoGraticule10();
export function Globe({
  moving,
  home,
  applications,
  highlightedIds = null,
  ribbons = null,
  emphasisId = null,
  uplink = null,
  signals = null,
  onCity,
}: {
  moving: boolean;
  home: HomeLocation;
  applications: Application[];
  highlightedIds?: ReadonlySet<string> | null;
  ribbons?: GlobeRibbons | null;
  emphasisId?: string | null;
  uplink?: { origin: Point; place: string } | null;
  signals?: ReadonlyMap<string, PlaceSignal> | null;
  onCity: (city: Theme, ids: string[]) => void;
}) {
  const [hoverPlace, setHoverPlace] = useState<string | null>(null);
  const emphasis = (place: { id: string; ids: string[] }) =>
    emphasisId === null && hoverPlace === null
      ? undefined
      : (emphasisId !== null && place.ids.includes(emphasisId)) ||
          hoverPlace === place.id
        ? "on"
        : "off";
  const [orbit, setOrbit] = useState<[number, number]>(
    home.coordinates ?? [0, 20],
  );
  const drag = useRef<{ x: number; y: number; orbit: [number, number] } | null>(
    null,
  );
  const markers = useRef<Map<string, SVGGElement>>(new Map());
  const places = useMemo(
    () => geographicGroups(applications).filter((p) => p.coordinates),
    [applications],
  );
  const placeKey = places.map((p) => p.id + ":" + p.ids.length).join("|");
  const ribbonPaths = useRef<Map<string, SVGGElement>>(new Map());
  const uplinkPath = useRef<SVGPathElement>(null);
  const uplinkKey = uplink
    ? `${uplink.place}@${uplink.origin.x},${uplink.origin.y}`
    : "";
  const selected = useMemo(
    () =>
      ribbons && highlightedIds
        ? new Map(
            placeCounts(places, highlightedIds).map((p) => [
              p.id,
              p.members.length,
            ]),
          )
        : null,
    [places, highlightedIds, ribbons],
  );
  const ribbonKey = ribbons
    ? `${ribbons.origin.x},${ribbons.origin.y}|${[...(selected ?? [])].join(";")}`
    : "";
  useEffect(
    () => setOrbit(home.coordinates ?? [0, 20]),
    [home.coordinates?.[0], home.coordinates?.[1]],
  );
  const present = useIsPresent();
  const target = usePresenceData() as Theme | undefined;
  const earth = useRef<SVGPathElement>(null),
    lines = useRef<SVGPathElement>(null),
    rim = useRef<SVGCircleElement>(null),
    ocean = useRef<SVGCircleElement>(null),
    shade = useRef<SVGCircleElement>(null),
    pin = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const destination = target ? cityCoordinates[target] : undefined;
    const start = orbit;
    const delta = destination
      ? ((destination[0] - start[0] + 540) % 360) - 180
      : 0;
    const projection = geoOrthographic().clipAngle(90).precision(0.5);
    // Measure labels before camera writes; don't force layout for each animation frame.
    const labelWidths = new Map(
      places.map((place) => {
        const text = markers.current
          .get(place.id)
          ?.querySelector<SVGTextElement>("[data-city-name]");
        const countWidth = Math.max(
          26,
          String(place.ids.length).length * 8 + 12,
        );
        return [
          place.id,
          Math.max(
            text?.getComputedTextLength() ?? 0,
            place.label.length * 8.5,
          ) +
            countWidth +
            22,
        ];
      }),
    );
    function draw(progress: number) {
      const turn = Math.min(progress / 0.68, 1);
      const rotation = turn * turn * (3 - 2 * turn);
      const zoom = Math.max(0, (progress - 0.25) / 0.75);
      const radius = 340 * Math.pow(4.5, zoom * zoom);
      const y = 455;
      projection
        .rotate([
          -(start[0] + delta * rotation),
          -(start[1] + ((destination?.[1] ?? start[1]) - start[1]) * rotation),
        ])
        .translate([800, y])
        .scale(radius);
      const anchors: CityAnchor[] = [];
      for (const place of places) {
        const marker = markers.current.get(place.id),
          coordinate = place.coordinates!;
        if (!marker) continue;
        const projected = projection(coordinate)!;
        const front =
          geoDistance(
            [
              start[0] + delta * rotation,
              start[1] + ((destination?.[1] ?? start[1]) - start[1]) * rotation,
            ],
            coordinate,
          ) <
          Math.PI / 2 - 0.08;
        marker.setAttribute(
          "transform",
          `translate(${projected[0]} ${projected[1]})`,
        );
        marker.style.display = front && present ? "" : "none";
        if (front && present) {
          anchors.push({
            id: place.id,
            x: projected[0],
            y: projected[1],
            width: labelWidths.get(place.id)!,
          });
        }
      }
      const facing = new Set(anchors.map((anchor) => anchor.id));
      const drawn = new Set<string>(
        [...(selected?.keys() ?? [])]
          .filter((id) => facing.has(id))
          .slice(0, RIBBON_LIMIT),
      );
      for (const [id, ribbon] of ribbonPaths.current) {
        const anchor = anchors.find((a) => a.id === id);
        const show = !!ribbons && !!anchor && drawn.has(id);
        ribbon.style.display = show ? "" : "none";
        if (!show) continue;
        const d = ribbonPath(ribbons.origin, anchor, GLOBE_CENTER);
        for (const path of ribbon.querySelectorAll("path"))
          path.setAttribute("d", d);
      }
      const linked = uplink && anchors.find((a) => a.id === uplink.place);
      if (uplinkPath.current) {
        uplinkPath.current.style.display = linked ? "" : "none";
        if (linked)
          uplinkPath.current.setAttribute(
            "d",
            ribbonPath(uplink.origin, linked, GLOBE_CENTER),
          );
      }
      for (const label of layoutCityLabels(anchors, {
        left: 440,
        right: 1160,
        top: 115,
        bottom: 790,
      })) {
        const marker = markers.current.get(label.id)!;
        marker
          .querySelector("[data-city-label]")
          ?.setAttribute(
            "transform",
            `translate(${label.left - label.x} ${label.top - label.y + 17})`,
          );
        marker
          .querySelector("[data-city-pill]")
          ?.setAttribute("width", String(label.width));
        const leader = marker.querySelector("[data-city-leader]");
        leader?.setAttribute("x2", String(label.leaderX - label.x));
        leader?.setAttribute("y2", String(label.leaderY - label.y));
      }
      const path = geoPath(projection);
      earth.current?.setAttribute("d", path(land) ?? "");
      lines.current?.setAttribute("d", path(grid) ?? "");
      for (const ref of [rim, ocean, shade]) {
        ref.current?.setAttribute("r", String(radius));
        ref.current?.setAttribute("cy", String(y));
      }
      if (destination && pin.current) {
        const p = projection(destination)!;
        pin.current.setAttribute("cx", String(p[0]));
        pin.current.setAttribute("cy", String(p[1]));
        pin.current.setAttribute("opacity", String(progress > 0.35 ? 0.7 : 0));
      }
    }
    draw(0);
    if (!present && destination && moving) {
      const control = animate(0, 1, {
        duration: 1.25,
        ease: [0.4, 0, 0.2, 1],
        onUpdate: draw,
      });
      return () => control.stop();
    }
  }, [
    present,
    target,
    moving,
    orbit[0],
    orbit[1],
    placeKey,
    ribbonKey,
    uplinkKey,
  ]);
  return (
    <g
      className="earth-globe"
      data-home={home.label ?? "unset"}
      data-camera={present ? "orbit" : "approach"}
    >
      <defs>
        <radialGradient id="earth-ocean" cx="32%" cy="24%" r="80%">
          <stop stopColor="#274d6a" />
          <stop offset=".65" stopColor="#132b43" />
          <stop offset="1" stopColor="#050d1b" />
        </radialGradient>
        <radialGradient id="earth-shade" cx="30%" cy="25%" r="80%">
          <stop offset=".3" stopColor="#020915" stopOpacity="0" />
          <stop offset="1" stopColor="#020915" stopOpacity=".9" />
        </radialGradient>
        <filter id="earth-atmosphere">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <circle
        ref={rim}
        cx="800"
        cy="455"
        r="340"
        fill="none"
        stroke="#6eabce"
        strokeWidth="6"
        opacity=".4"
        filter="url(#earth-atmosphere)"
      />
      <circle ref={ocean} cx="800" cy="455" r="340" fill="url(#earth-ocean)" />
      <path ref={earth} fill="#3d6375" stroke="#688b97" strokeWidth=".5" />
      <path
        ref={lines}
        fill="none"
        stroke="#7d9baa"
        strokeWidth=".5"
        opacity=".13"
      />
      <circle ref={shade} cx="800" cy="455" r="340" fill="url(#earth-shade)" />
      <circle ref={pin} r="4" fill="#b3def1" opacity="0" />
      {present && (
        <circle
          className="globe-drag"
          cx="800"
          cy="455"
          r="340"
          fill="transparent"
          role="slider"
          tabIndex={0}
          aria-label="Rotate globe"
          aria-valuemin={-180}
          aria-valuemax={180}
          aria-valuenow={Math.round(orbit[0])}
          aria-valuetext="Use arrow keys to rotate the globe"
          onPointerDown={(e) => {
            e.preventDefault();
            drag.current = { x: e.clientX, y: e.clientY, orbit };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current)
              setOrbit([
                ((drag.current.orbit[0] -
                  (e.clientX - drag.current.x) * 0.35 +
                  540) %
                  360) -
                  180,
                Math.max(
                  -70,
                  Math.min(
                    70,
                    drag.current.orbit[1] + (e.clientY - drag.current.y) * 0.25,
                  ),
                ),
              ]);
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(e) => {
            if (
              ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                e.key,
              )
            ) {
              e.preventDefault();
              setOrbit([
                ((orbit[0] +
                  (e.key === "ArrowLeft"
                    ? -15
                    : e.key === "ArrowRight"
                      ? 15
                      : 0) +
                  540) %
                  360) -
                  180,
                Math.max(
                  -70,
                  Math.min(
                    70,
                    orbit[1] +
                      (e.key === "ArrowUp"
                        ? 10
                        : e.key === "ArrowDown"
                          ? -10
                          : 0),
                  ),
                ),
              ]);
            }
          }}
        />
      )}
      <path
        ref={uplinkPath}
        className="satellite-uplink"
        data-uplink={uplink?.place}
        fill="none"
        stroke="#b3adff"
        strokeWidth="2"
        strokeOpacity=".85"
        strokeLinecap="round"
        strokeDasharray="2 7"
        aria-hidden="true"
        pointerEvents="none"
        style={{ display: "none" }}
      />
      <g className="city-ribbons" aria-hidden="true">
        {ribbons &&
          places.map((place) => {
            const count = selected?.get(place.id) ?? 0;
            if (!count) return null;
            // The globe is drawn at 0.75 scale; keep widths true on screen.
            const width = ribbonWidth(count) / 0.75;
            return (
              <g
                key={place.id}
                className="city-ribbon"
                data-ribbon={place.id}
                data-count={count}
                data-emphasis={emphasis(place)}
                style={
                  {
                    color: ribbons.color,
                    display: "none",
                    "--stale": signals?.get(place.id)?.stale ?? 0,
                  } as CSSProperties
                }
                onMouseEnter={() => setHoverPlace(place.id)}
                onMouseLeave={() => setHoverPlace(null)}
                ref={(el) => {
                  if (el) ribbonPaths.current.set(place.id, el);
                  else ribbonPaths.current.delete(place.id);
                }}
              >
                <path
                  className="ribbon-halo"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={width + 10}
                  strokeOpacity=".12"
                  filter="url(#earth-atmosphere)"
                />
                <path
                  className="ribbon-body"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={width}
                  strokeOpacity=".5"
                  strokeLinecap="round"
                  pointerEvents="stroke"
                >
                  <title>
                    {place.label} · {count}
                    {signals?.get(place.id)?.stale
                      ? ` · ${Math.round(signals.get(place.id)!.stale * 100)}% silent 30+ days`
                      : ""}
                  </title>
                </path>
                {moving && (
                  <path
                    className="flow-light ribbon-light"
                    fill="none"
                    stroke="#f2f7ff"
                    strokeWidth={Math.min(3, width)}
                    strokeOpacity=".8"
                    strokeLinecap="round"
                    pathLength="100"
                    strokeDasharray="3 97"
                  />
                )}
              </g>
            );
          })}
      </g>
      {places.map((place) => (
        <g
          key={place.id}
          className="globe-city"
          data-emphasis={emphasis(place)}
          data-band={signals?.get(place.id)?.band}
          data-relevance={
            highlightedIds === null
              ? "all"
              : place.ids.some((id) => highlightedIds.has(id))
                ? "related"
                : "unrelated"
          }
          style={
            {
              "--stale": signals?.get(place.id)?.stale ?? 0,
              opacity:
                highlightedIds === null ||
                place.ids.some((id) => highlightedIds.has(id))
                  ? 1
                  : 0.2,
              transition: moving ? "opacity 240ms ease-out" : "none",
            } as CSSProperties
          }
          ref={(el) => {
            if (el) markers.current.set(place.id, el);
            else markers.current.delete(place.id);
          }}
          role="button"
          tabIndex={present ? 0 : -1}
          aria-label={`${place.label}: ${place.ids.length} applications`}
          onClick={() => onCity(place.id, place.ids)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onCity(place.id, place.ids);
            }
          }}
        >
          <line
            data-city-leader
            x1="0"
            y1="0"
            stroke="#91bfd5"
            strokeWidth="1"
            opacity=".65"
            pointerEvents="none"
          />
          <circle r="3.5" fill="#b7eaff" stroke="#071424" strokeWidth="1" />
          <g data-city-label>
            <rect
              data-city-pill
              x="0"
              y="-17"
              height="34"
              rx="17"
              fill="#071424"
              fillOpacity=".94"
              stroke="#6b9bb5"
              strokeWidth=".8"
            />
            <text
              x={7 + Math.max(26, String(place.ids.length).length * 8 + 12) / 2}
              y="5"
              textAnchor="middle"
              fill="#bceafa"
              fontSize="14"
              fontWeight="700"
            >
              {selected ? (selected.get(place.id) ?? 0) : place.ids.length}
            </text>
            <text
              data-city-name
              x={Math.max(26, String(place.ids.length).length * 8 + 12) + 14}
              y="5"
              fill="#eef8ff"
              fontSize="15"
              fontWeight="600"
            >
              {place.label}
            </text>
          </g>
        </g>
      ))}
    </g>
  );
}
