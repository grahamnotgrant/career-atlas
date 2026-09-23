import { Globe, type PlaceSignal } from "./Globe";
import type { Point } from "./journey";
import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties } from "react";
import type { Theme, HomeLocation, Application } from "../shared/model";
import type { Opportunity } from "../shared/career";
import { sceneCatalog } from "../shared/locations";

function Palm({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="palms">
      <path d="M0 110Q14 50 0 0" fill="none" strokeWidth="7" />
      <path d="M0 0Q-48-26-70 5Q-32-6 0 0Q-45 1-50 36Q-23 10 0 0Q-12-45-39-48Q-10-24 0 0Q19-45 48-36Q14-21 0 0Q48-24 71 3Q33-8 0 0Q40 10 45 41Q15 12 0 0" />
    </g>
  );
}
function Skyline({ variant = 0 }: { variant?: number }) {
  return (
    <g className="distant-buildings">
      {Array.from({ length: 23 }, (_, i) => {
        const h = 25 + ((i * 47 + variant * 29) % 96);
        return (
          <path
            key={i}
            d={`M${i * 72 - 20} 570v-${h}h${32 + (i % 3) * 9}v${h}Z`}
          />
        );
      })}
    </g>
  );
}
function Water() {
  return (
    <g className="water">
      <path d="M0 578Q400 562 800 578T1600 576V650H0Z" />
      <path
        d="M80 598h220m100 12h290m260-15h380M15 625h410m500 8h470"
        fill="none"
      />
    </g>
  );
}
/* Cities without drawn landmarks share a skyline whose shape and a single
   tower are picked from the city id, so each still looks like its own place. */
function GenericCity({ theme }: { theme: Theme }) {
  const seed = [...theme].reduce(
    (n, ch) => (n * 31 + ch.charCodeAt(0)) % 997,
    7,
  );
  const variant = 14 + (seed % 11);
  const x = 240 + (seed % 5) * 60,
    h = 220 + (seed % 7) * 22;
  return (
    <>
      <Skyline variant={variant} />
      <path
        d={`M${x} 580V${580 - h}h22V${580 - h - 40}h6V${580 - h}h22V580Z`}
      />
      <path
        className="architectural-line"
        d={`M${x + 11} ${600 - h}V560m28-${h - 20}V560`}
      />
      {seed % 2 === 0 && <Water />}
    </>
  );
}
function Artwork({ theme }: { theme: Theme }) {
  switch (theme) {
    case "neutral":
    case "remote":
      return null;
    case "nyc":
      return (
        <>
          <Skyline />
          <path d="M265 580V390H280V320H298V280H310V205H316V280H328V320H348V390H366V580ZM1130 580V345L1156 270 1182 345V580Z" />
          <path
            className="architectural-line"
            d="M298 340V560m30-220v220m-50-158h77m-70 20h70m797-77v210"
          />
          <Water />
        </>
      );
    case "chicago":
      return (
        <>
          <Skyline variant={1} />
          <path d="M285 580V350H305V265H337V220H343V265H359V220H365V310H390V365H415V580ZM1130 580V340L1140 300H1147V250H1152V300H1193V250H1198V300L1210 340V580Z" />
          <path
            className="architectural-line"
            d="M322 288V566m36-239v237m26-183v185M1138 360l64 180m0-180-64 180"
          />
          <Water />
        </>
      );
    case "la":
      return (
        <>
          <path
            className="hills"
            d="M0 580Q180 395 390 435T770 480T1150 430T1600 520V650H0Z"
          />
          <g className="observatory">
            <path d="M260 445v-54h32v-12h125v12h32v54ZM288 390v-24a20 20 0 0 1 40 0v24Zm63-12v-29a34 34 0 0 1 68 0v29Z" />
            <path
              className="architectural-line"
              d="M273 402h164m-144 10v24m23-24v24m24-24v24m24-24v24m24-24v24m24-24v24"
            />
          </g>
          <Skyline variant={2} />
          <Palm x={1265} y={420} />
          <Palm x={1380} y={445} scale={0.8} />
        </>
      );
    case "san-diego":
      return (
        <>
          <Skyline variant={3} />
          <Water />
          <g className="bridge">
            <path d="M80 535Q520 335 1020 450T1580 520M80 549Q520 349 1020 464T1580 534" />
            {[260, 440, 620, 800, 980, 1160, 1340].map((x, i) => (
              <path
                key={x}
                d={`M${x} ${[467, 421, 415, 429, 451, 485, 514][i]}V585`}
              />
            ))}
          </g>
          <Palm x={95} y={450} />
        </>
      );
    case "miami":
      return (
        <>
          <Water />
          <g className="art-deco">
            <path d="M220 570V425h35v-22h85v22h35v145Zm810 0V450h35v-32h100v32h35v120Z" />
            <path
              className="architectural-line"
              d="M230 440h135m-135 18h135m-135 18h135m-135 18h135m-75-80v140m750-97h152m-152 20h152m-152 20h152m-80-82v140"
            />
          </g>
          <Palm x={110} y={397} />
          <Palm x={1350} y={415} />
          <Palm x={1460} y={450} scale={0.8} />
        </>
      );
    case "seattle":
      return (
        <>
          <path
            className="hills"
            d="M750 570 1100 310 1190 378 1250 365 1560 570Z"
          />
          <path
            className="snow"
            d="m1030 364 70-54 90 68 60-13 72 62-93-32-38 10-81-56-26 47Z"
          />
          <Skyline variant={4} />
          <g className="needle">
            <path
              d="M285 570 313 365h14l29 205M320 365v-80"
              fill="none"
              strokeWidth="7"
            />
            <path d="M265 346Q320 312 376 346L352 360H287ZM290 331l30-17 31 17Z" />
          </g>
          <Water />
        </>
      );
    case "dallas":
      return (
        <>
          <Skyline variant={5} />
          <path d="M1070 578V340L1135 310V578Z" />
          <g className="reunion">
            <path
              d="M316 576V381m-12 195V381m24 195V381"
              fill="none"
              strokeWidth="4"
            />
            <circle cx="316" cy="350" r="36" />
            <g className="architectural-line">
              <ellipse cx="316" cy="350" rx="18" ry="36" />
              <path d="M280 350h72m-66-17h60m-60 34h60" />
              <path d="M1076 567V345l53-25v247Z" />
            </g>
          </g>
        </>
      );
    case "denver":
      return (
        <>
          <path
            className="hills"
            d="M0 580 205 300 330 435 490 230 690 475 855 310 1030 475 1240 255 1460 490 1600 400V650H0Z"
          />
          <path
            className="snow"
            d="m418 320 72-90 80 94-63-28-18-30-23 44-18-19Zm738 41 84-106 88 113-81-37-28 23-16-30Z"
          />
          <Skyline variant={6} />
        </>
      );
    case "sf":
      return (
        <>
          <path
            className="hills"
            d="M0 580Q170 430 350 545T900 560T1350 540T1600 480V650H0Z"
          />
          <Water />
          <g className="bridge golden-gate">
            <path d="M280 575V300m32 275V300m850 275V300m32 275V300M140 490H1410M280 320Q730 635 1194 320M280 320Q230 442 100 495M1194 320Q1300 445 1480 495M280 350h32m-32 45h32m850-45h32m-32 45h32M450 419v71m140-18v18m425-46v46" />
          </g>
        </>
      );
    case "austin":
      return (
        <>
          <Skyline variant={7} />
          <path d="M280 576V395l20-30 20-40 20 40 20 30v181Z" />
          <path
            className="architectural-line"
            d="m280 395 40 40 40-40m-40 40v125m-20-195 20 20 20-20"
          />
          <Water />
        </>
      );
    case "boston":
      return (
        <>
          <Skyline variant={8} />
          <Water />
          <g className="bridge">
            <path d="M270 578V350l-15-35m15 35 15-35M1110 578V350l-15-35m15 35 15-35M100 520H1450" />
            {[170, 220, 360, 450, 560, 690].map((x) => (
              <path key={x} d={`M270 357 ${x} 520M1110 357 ${1600 - x} 520`} />
            ))}
          </g>
        </>
      );
    case "atlanta":
      return (
        <>
          <Skyline variant={9} />
          <path d="M285 580V380h12v-25l28-55 28 55v25h12v200Z" />
          <path
            className="architectural-line"
            d="M297 380h56m-28-80v74m-20 27v165m39-165v165"
          />
          <path
            className="hills"
            d="M0 605Q150 545 300 593T650 594T1060 590T1600 580V650H0Z"
          />
        </>
      );
    case "london":
      return (
        <>
          <Skyline variant={10} />
          <path d="M220 580V475h170v105Zm38-105V340h10v-40l26-52 26 52v40h10v135Z" />
          <circle className="clock-face" cx="294" cy="365" r="19" />
          <path
            className="architectural-line"
            d="M294 353v12l10 6m-26 29h32m-32 20h32m-32 20h32"
          />
          <g className="architectural-line">
            <circle cx="1170" cy="430" r="100" />
            {[0, 45, 90, 135].map((angle) => (
              <path
                key={angle}
                transform={`rotate(${angle} 1170 430)`}
                d="M1070 430h200"
              />
            ))}
          </g>
          <Water />
        </>
      );
    case "toronto":
      return (
        <>
          <Skyline variant={11} />
          <path d="M299 580 313 341h14l14 239ZM318 325V205h4v120ZM285 335l12-15h46l12 15-12 12h-46Z" />
          <path className="architectural-line" d="M290 335h59m-29 16v209" />
          <Water />
        </>
      );
    case "paris":
      return (
        <>
          <Skyline variant={12} />
          <g className="eiffel">
            <path d="M240 580Q305 460 320 300Q335 460 400 580M270 510h100m-85-55h70m-53-58h36m-18-97v-30M270 580Q320 490 370 580" />
            <path d="m281 497 70-42m-54-13 40-38m-75 131 119-23m-98-29 66 46" />
          </g>
          <Water />
        </>
      );
    case "sydney":
      return (
        <>
          <Skyline variant={13} />
          <Water />
          <g className="opera">
            <path d="M220 550Q240 480 260 445Q300 460 340 550ZM285 550Q330 450 370 405Q405 470 415 550ZM370 550Q438 465 470 440Q490 492 485 550ZM430 550Q490 512 535 500L520 550Z" />
            <path
              className="architectural-line"
              d="M220 557h320m-277-97 66 82m41-115 35 114m66-90 4 90"
            />
          </g>
        </>
      );
    default:
      return <GenericCity theme={theme} />;
  }
}
/* The globe is drawn in its own coordinates, then placed in the 1350x800 scene. */
const GLOBE_OFFSET = { x: 75, y: 48.75 },
  GLOBE_SCALE = 0.75;
export function Scene({
  theme,
  moving = true,
  home,
  applications,
  highlightedIds = null,
  ribbons = null,
  emphasisId = null,
  uplink = null,
  signals = null,
  opportunities = [],
  onCity,
}: {
  theme: Theme;
  moving?: boolean;
  home: HomeLocation;
  applications: Application[];
  /** Tracked roles; cleared ones ring their city until a submission lands. */
  opportunities?: Opportunity[];
  highlightedIds?: ReadonlySet<string> | null;
  /** Where ribbons leave from, in scene coordinates. */
  ribbons?: { origin: Point; color: string } | null;
  emphasisId?: string | null;
  /** A line from a scene point to one place on the globe. */
  uplink?: { origin: Point; place: string } | null;
  signals?: ReadonlyMap<string, PlaceSignal> | null;
  onCity: (city: Theme, ids: string[]) => void;
}) {
  const entry = sceneCatalog[theme];
  const toGlobe = (point: Point) => ({
    x: (point.x - GLOBE_OFFSET.x) / GLOBE_SCALE,
    y: (point.y - GLOBE_OFFSET.y) / GLOBE_SCALE,
  });
  const globe = theme === "neutral" || theme === "remote";
  return (
    <div className="scenes">
      <AnimatePresence mode="wait" initial={false} custom={theme}>
        <motion.div
          key={theme}
          className={`scene scene-${theme}`}
          data-scene={theme}
          data-landmark={entry.landmark}
          style={{ "--scene-tint": entry.tint } as CSSProperties}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit="depart"
          variants={{
            depart: (destination: Theme) => ({
              opacity: 0,
              transition: {
                duration: moving ? 0.22 : 0,
                delay:
                  moving &&
                  globe &&
                  destination !== "neutral" &&
                  destination !== "remote"
                    ? 1.03
                    : 0,
              },
            }),
          }}
          transition={{ duration: moving ? 0.3 : 0 }}
        >
          <div className="scene-light" />
          <motion.svg
            viewBox={globe ? "0 0 1350 800" : "0 0 1600 650"}
            preserveAspectRatio={globe ? "xMidYMid meet" : "xMidYMax slice"}
            className={globe ? "globe-camera" : "city-camera"}
            initial={
              moving && !globe ? { scale: 1, x: 28 } : { scale: 1, x: 0 }
            }
            animate={{ scale: moving && !globe ? 1.1 : 1, x: 0 }}
            transition={{
              duration: moving ? 1.45 : 0,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{ transformOrigin: "50% 72%" }}
          >
            {!globe && <title>{entry.landmark}</title>}
            {globe ? (
              <g
                transform={`translate(${GLOBE_OFFSET.x} ${GLOBE_OFFSET.y}) scale(${GLOBE_SCALE})`}
              >
                <Globe
                  moving={moving}
                  home={home}
                  applications={applications}
                  highlightedIds={highlightedIds}
                  ribbons={
                    ribbons && {
                      color: ribbons.color,
                      origin: toGlobe(ribbons.origin),
                    }
                  }
                  emphasisId={emphasisId}
                  signals={signals}
                  opportunities={opportunities}
                  uplink={
                    uplink && {
                      place: uplink.place,
                      origin: toGlobe(uplink.origin),
                    }
                  }
                  onCity={onCity}
                />
              </g>
            ) : (
              <Artwork theme={theme} />
            )}
          </motion.svg>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
