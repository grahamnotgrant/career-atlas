import { useEffect, useRef, useState } from "react";
import { animate, useIsPresent, usePresenceData } from "motion/react";
import { geoGraticule10, geoOrthographic, geoPath, geoDistance } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import world from "world-atlas/land-110m.json";
import { cityCoordinates, geographicGroups } from "../shared/locations";
import type { Theme, HomeLocation, Application } from "../shared/model";
const topology = world as unknown as Topology<{ land: GeometryCollection }>;
const land = feature(topology, topology.objects.land);
const grid = geoGraticule10();
export function Globe({
  moving,
  home,
  applications,
  onCity,
}: {
  moving: boolean;
  home: HomeLocation;
  applications: Application[];
  onCity: (city: Theme, ids: string[]) => void;
}) {
  const [orbit, setOrbit] = useState<[number, number]>(
    home.coordinates ?? [0, 20],
  );
  const drag = useRef<{ x: number; y: number; orbit: [number, number] } | null>(
    null,
  );
  const markers = useRef<Map<string, SVGGElement>>(new Map());
  const places = geographicGroups(applications).filter((p) => p.coordinates);
  const placeKey = places.map((p) => p.id + ":" + p.ids.length).join("|");
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
    function draw(progress: number) {
      const turn = Math.min(progress / 0.68, 1);
      const rotation = turn * turn * (3 - 2 * turn);
      const zoom = Math.max(0, (progress - 0.25) / 0.75);
      const radius = 300 * Math.pow(4.5, zoom * zoom);
      const y = 455;
      projection
        .rotate([
          -(start[0] + delta * rotation),
          -(start[1] + ((destination?.[1] ?? start[1]) - start[1]) * rotation),
        ])
        .translate([800, y])
        .scale(radius);
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
  }, [present, target, moving, orbit[0], orbit[1], placeKey]);
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
        r="300"
        fill="none"
        stroke="#6eabce"
        strokeWidth="6"
        opacity=".4"
        filter="url(#earth-atmosphere)"
      />
      <circle ref={ocean} cx="800" cy="455" r="300" fill="url(#earth-ocean)" />
      <path ref={earth} fill="#3d6375" stroke="#688b97" strokeWidth=".5" />
      <path
        ref={lines}
        fill="none"
        stroke="#7d9baa"
        strokeWidth=".5"
        opacity=".13"
      />
      <circle ref={shade} cx="800" cy="455" r="300" fill="url(#earth-shade)" />
      <circle ref={pin} r="4" fill="#b3def1" opacity="0" />
      {present && (
        <circle
          className="globe-drag"
          cx="800"
          cy="455"
          r="300"
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
      {places.map((place) => (
        <g
          key={place.id}
          className="globe-city"
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
          <circle r="15" fill="#071424" stroke="#a3d8ea" strokeWidth="1.5" />
          <text y="5" textAnchor="middle" fill="#eef8ff" fontSize="13">
            {place.ids.length}
          </text>
          <text
            x="21"
            y="5"
            fill="#e8f5ff"
            stroke="#071424"
            strokeWidth="4"
            paintOrder="stroke"
            fontSize="15"
          >
            {place.label}
          </text>
        </g>
      ))}
    </g>
  );
}
