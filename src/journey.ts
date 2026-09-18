import type { Application, Outcome, Stage, Status } from "../shared/model";
import { cityCoordinates, scenesForLocation } from "../shared/locations";
export const center = { x: 675, y: 390 };
export function polar(angle: number, radius = 285) {
  const a = (angle * Math.PI) / 180;
  return {
    x: center.x + Math.cos(a) * radius,
    y: center.y + Math.sin(a) * radius,
  };
}
export function arc(from: number, to: number, radius = 285) {
  const start = polar(from, radius),
    end = polar(to, radius);
  return `M${start.x} ${start.y} A${radius} ${radius} 0 ${Math.abs(to - from) > 180 ? 1 : 0} ${to > from ? 1 : 0} ${end.x} ${end.y}`;
}
export const hubs = [
  { id: "applied", label: "Applied", angle: 200, color: "#7caeff" },
  { id: "recruiter", label: "Recruiter", angle: 235, color: "#be9eff" },
  { id: "hiring", label: "Hiring manager", angle: 270, color: "#ffd48c" },
  { id: "case", label: "Case / technical", angle: 305, color: "#ffa0a9" },
  { id: "offer", label: "Offer", angle: 340, color: "#8ff2c7" },
] as const;
export const pools = [
  {
    id: "pending",
    label: "Awaiting response",
    angle: 158,
    start: 138,
    end: 178,
    color: "#b59aff",
  },
  {
    id: "noreply",
    label: "No reply",
    angle: 118,
    start: 100,
    end: 136,
    color: "#8fa3bd",
  },
  {
    id: "rejected",
    label: "Rejected",
    angle: 80,
    start: 62,
    end: 98,
    color: "#ff969f",
  },
  {
    id: "closed",
    label: "Closed / withdrawn",
    angle: 38,
    start: 8,
    end: 58,
    color: "#b9c9df",
  },
] as const;
export function seeded(id: string) {
  let n = 2166136261;
  for (const c of id) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return (n >>> 0) / 4294967295;
}
export function recordedStages(a: Application): Stage[] {
  return a.events
    .flatMap((e) => (e.stage ? [e.stage] : []))
    .filter((s, i, all) => all.indexOf(s) === i);
}
export function lastStage(a: Application): Stage | null {
  return recordedStages(a).at(-1) ?? null;
}
export function unknownStage(a: Application) {
  const lastInterview = a.events.findLast(
    (e) => e.kind === "interview" || e.kind === "invitation",
  );
  return !!lastInterview && lastInterview.stage === null;
}
export function currentStage(a: Application): Stage | null {
  if (a.status === "rejected" || a.status === "closed" || unknownStage(a))
    return null;
  return a.status === "offer" ? "offer" : lastStage(a);
}
export function stageStats(apps: Application[], stage: Stage) {
  const reached = apps.filter((a) => recordedStages(a).includes(stage));
  return {
    reached,
    current: reached.filter((a) => currentStage(a) === stage),
    other: reached.filter((a) => currentStage(a) !== stage),
    passed: reached.filter((a) =>
      recordedStages(a).some(
        (s) =>
          hubs.findIndex((h) => h.id === s) >
          hubs.findIndex((h) => h.id === stage),
      ),
    ),
    ended: reached.filter(
      (a) => a.status === "rejected" || a.status === "closed",
    ),
    unknown: reached.filter(unknownStage),
  };
}
export function outcomeBreakdown(apps: Application[], outcome: Outcome) {
  const members = apps.filter((a) => outcomeOf(a) === outcome);
  const counts = new Map<string, number>();
  for (const a of members) {
    const label = unknownStage(a)
      ? "Interview stage unknown"
      : (a.status === "rejected" || a.status === "closed") &&
          lastStage(a) === "applied"
        ? "No interview stage recorded"
        : (hubs.find((h) => h.id === lastStage(a))?.label ?? "Stage unknown");
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count }));
}
export interface Journey {
  id: string;
  path: string;
  end: { x: number; y: number };
  color: string;
  stages: Stage[];
  uncertain: boolean;
  label: boolean;
  lane: number;
}
export function journeys(apps: Application[], city = false): Journey[] {
  const slots = new Map<string, number>();
  const used = new Map<string, Set<number>>();
  for (const a of [...apps].sort(
    (a, b) =>
      (a.submitted ?? "").localeCompare(b.submitted ?? "") ||
      a.id.localeCompare(b.id),
  )) {
    const group =
      a.status === "interview" || a.status === "offer"
        ? `${a.status}-${currentStage(a)}`
        : a.status;
    const taken = used.get(group) ?? new Set<number>();
    let slot = Math.floor(seeded(a.id + "end") * 8);
    while (taken.has(slot)) slot++;
    taken.add(slot);
    used.set(group, taken);
    slots.set(a.id, slot);
  }
  return apps.map((a) => {
    const stages = recordedStages(a),
      slot = slots.get(a.id)!,
      lane = 305 + seeded(a.id) * 15;
    const angle = (s: Stage) => hubs.find((h) => h.id === s)!.angle;
    const first = angle(stages[0] ?? "applied"),
      start = polar(first);
    let path = `M${start.x} ${start.y}`,
      last = first;
    for (const stage of stages.slice(1)) {
      const target = angle(stage),
        hub = polar(target);
      path += ` L${hub.x} ${hub.y}`;
      last = target;
    }
    let endAngle: number, color: string;
    if (a.status === "interview" || a.status === "offer") {
      endAngle =
        angle(currentStage(a) ?? lastStage(a) ?? "applied") +
        5 +
        (slot % 8) * 2.7;
      color = a.status === "offer" ? "#8ff2c7" : "#c3a8ff";
    } else {
      const pool = pools.find((p) => p.id === outcomeOf(a))!;
      const dot = slot % 8;
      endAngle =
        dot < 4
          ? pool.start + 4 + (dot * (pool.angle - 13 - pool.start)) / 3
          : pool.angle + 9 + ((dot - 4) * (pool.end - pool.angle - 13)) / 3;
      color = pool.color;
    }
    let end = polar(endAngle, 285 + Math.floor(slot / 8) * 18);
    if (a.status !== "interview" && a.status !== "offer") {
      const terminal = polar(pools.find((p) => p.id === outcomeOf(a))!.angle);
      path += ` L${terminal.x} ${terminal.y}`;
    }
    path += ` L${end.x} ${end.y}`;
    if (city) {
      const active = a.status === "interview" || a.status === "offer";
      const target = active
        ? (currentStage(a) ?? lastStage(a) ?? "applied")
        : a.status;
      const anchor = connectionPoint(target, true);
      const peers = apps
        .filter(
          (other) =>
            active &&
            (other.status === "interview" || other.status === "offer") &&
            (currentStage(other) ?? lastStage(other) ?? "applied") === target,
        )
        .sort(
          (a, b) =>
            (a.submitted ?? "").localeCompare(b.submitted ?? "") ||
            a.id.localeCompare(b.id),
        );
      end = active
        ? {
            x: anchor.x,
            y:
              anchor.y +
              62 +
              peers.findIndex((other) => other.id === a.id) * 30,
          }
        : { x: anchor.x, y: anchor.y };
      const points = (stages.length ? stages : ["applied"]).map((s) =>
        connectionPoint(s, true),
      );
      if (!active) points.push(anchor);
      path =
        points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ") +
        ` L${end.x} ${end.y}`;
    }
    return {
      id: a.id,
      path,
      end,
      color,
      stages,
      uncertain:
        unknownStage(a) ||
        stages.some(
          (s, i) =>
            i > 0 &&
            hubs.findIndex((h) => h.id === s) -
              hubs.findIndex((h) => h.id === stages[i - 1]) >
              1,
        ),
      label: true,
      lane,
    };
  });
}
export function cleanDisplay(value: string) {
  return value
    .replace(/\*\*|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
export function shortLocation(value: string) {
  const text = cleanDisplay(value);
  if (/remote/i.test(text)) return "Remote";
  if (/new york|nyc/i.test(text)) return "New York";
  if (/chicago/i.test(text)) return "Chicago";
  if (/san francisco|bay area/i.test(text)) return "San Francisco";
  if (/denver/i.test(text)) return "Denver";
  return text.split(/[,;(]/)[0];
}

export function connectionPoint(id: string, city = false) {
  const node = [...hubs, ...pools].find((h) => h.id === id)!;
  if (city) {
    const stageIndex = hubs.findIndex((h) => h.id === id);
    const outcomeIndex = pools.findIndex((p) => p.id === id);
    return {
      x: stageIndex >= 0 ? 175 + stageIndex * 250 : 250 + outcomeIndex * 283,
      y: stageIndex >= 0 ? 155 : 675,
      color: node.color,
    };
  }
  return { ...polar(node.angle), color: node.color };
}

/** Bound the drawing, not the dataset: full groups remain available in the list. */
export function visibleJourneys(
  apps: Application[],
  selectedId: string | null,
  perStage = 3,
) {
  const active = new Map<string, Application[]>();
  for (const app of apps) {
    if (app.status !== "interview" && app.status !== "offer") continue;
    const key = currentStage(app) ?? lastStage(app) ?? "applied";
    const group = active.get(key) ?? [];
    group.push(app);
    active.set(key, group);
  }
  const shown: Application[] = [],
    overflow: { stage: Stage; ids: string[]; hidden: number }[] = [];
  for (const [stage, group] of active) {
    group.sort(
      (a, b) =>
        (a.submitted ?? "").localeCompare(b.submitted ?? "") ||
        a.id.localeCompare(b.id),
    );
    const visible = group.slice(0, perStage);
    const selected = group.find((a) => a.id === selectedId);
    if (selected && !visible.includes(selected))
      visible[visible.length - 1] = selected;
    shown.push(...visible);
    if (group.length > visible.length)
      overflow.push({
        stage: stage as Stage,
        ids: group.map((a) => a.id),
        hidden: group.length - visible.length,
      });
  }
  const selected = apps.find((a) => a.id === selectedId);
  if (selected && !shown.some((a) => a.id === selected.id))
    shown.push(selected);
  return { shown, overflow };
}

export interface Point {
  x: number;
  y: number;
}
export type Selection =
  { kind: "stage"; id: Stage } | { kind: "outcome"; id: Outcome };
/** Applications a selection points at: those at the stage now, or in the outcome. */
export function selectionMembers(apps: Application[], selection: Selection) {
  return selection.kind === "stage"
    ? stageStats(apps, selection.id).current
    : apps.filter((a) => outcomeOf(a) === selection.id);
}
/** Places holding selected applications, largest first. A multi-office role
    counts under each of its places, so counts need not sum to the selection. */
export function placeCounts<T extends { id: string; ids: string[] }>(
  places: T[],
  members: ReadonlySet<string>,
) {
  return places
    .map((place) => ({
      ...place,
      members: place.ids.filter((id) => members.has(id)),
    }))
    .filter((place) => place.members.length > 0)
    .sort(
      (a, b) => b.members.length - a.members.length || a.id.localeCompare(b.id),
    );
}
/** One ribbon per place bounds the drawing by geography, not by volume. */
export const RIBBON_LIMIT = 8;
export function ribbonWidth(count: number) {
  return Math.min(14, 2 + Math.sqrt(count) * 0.9);
}
/** A curve from an orb to a place, bowed away from the orb-to-`axis` line so
    ribbons leaving one orb fan out in the order of their places. `inward`
    bows toward the axis instead, for a target that sits on the rim with the orbs. */
export function ribbonPath(
  from: Point,
  to: Point,
  axis: Point,
  inward = false,
) {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    length = Math.hypot(dx, dy);
  if (!length) return "";
  const side = Math.sign((axis.x - from.x) * dy - (axis.y - from.y) * dx) || 1;
  const bow = 0.18 * side * (inward ? -1 : 1);
  const control = {
    x: (from.x + to.x) / 2 - dy * bow,
    y: (from.y + to.y) / 2 + dx * bow,
  };
  const n = (v: number) => Math.round(v * 10) / 10;
  return `M${n(from.x)} ${n(from.y)} Q${n(control.x)} ${n(control.y)} ${n(to.x)} ${n(to.y)}`;
}
/** Points along a fall from `from` into `to`. The curve starts straight down
    and bends into the target; samples crowd toward the end so the motion
    accelerates like a dropped object. */
export function fallSamples(from: Point, to: Point, count = 16) {
  const control = {
    x: from.x + (to.x - from.x) * 0.12,
    y: from.y + (to.y - from.y) * 0.82,
  };
  return Array.from({ length: count }, (_, i) => {
    const t = Math.pow(i / (count - 1), 1.7),
      a = (1 - t) * (1 - t),
      b = 2 * (1 - t) * t,
      c = t * t;
    return {
      x: a * from.x + b * control.x + c * to.x,
      y: a * from.y + b * control.y + c * to.y,
    };
  });
}

/** The city a remote role is tied to, if its location names one. */
export function remoteRestriction(a: Application | undefined) {
  if (!a) return null;
  const matches = scenesForLocation(a.location);
  if (!matches.includes("remote")) return null;
  return matches.find((id) => id !== "remote" && cityCoordinates[id]) ?? null;
}
export function isRemote(a: Application) {
  return scenesForLocation(a.location).includes("remote");
}

/* Time. Event dates are calendar days, so every duration is in whole days. */
const DAY_MS = 86_400_000;
/** Silence this long after the last contact is treated as no reply. */
export const STALE_DAYS = 30;
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}
/** The local calendar date, since event dates are calendar days. */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function submittedOn(a: Application) {
  return (
    a.submitted ??
    a.events.find((e) => e.kind === "submission" && e.date)?.date ??
    a.events.find((e) => e.date)?.date ??
    null
  );
}
export function lastContact(a: Application) {
  return a.events.findLast((e) => e.date)?.date ?? submittedOn(a);
}
export function decidedOn(a: Application) {
  return (
    a.events.findLast((e) => e.kind === "decision" && e.date)?.date ?? null
  );
}
/** Days an application has waited with no dated event since. */
export function daysSilent(a: Application, asOf = today()) {
  const last = lastContact(a);
  return last ? Math.max(0, daysBetween(last, asOf)) : null;
}
export function isStale(a: Application, asOf = today()) {
  const silent = daysSilent(a, asOf);
  return a.status === "pending" && silent !== null && silent >= STALE_DAYS;
}
/** Days from submission to the recorded decision. */
export function daysToOutcome(a: Application) {
  const start = submittedOn(a),
    end = decidedOn(a);
  return start && end ? Math.max(0, daysBetween(start, end)) : null;
}
export const AGE_BUCKETS = [
  { label: "Under 1 week", max: 7 },
  { label: "1–2 weeks", max: 14 },
  { label: "2–4 weeks", max: 28 },
  { label: "1–3 months", max: 91 },
  { label: "Over 3 months", max: Infinity },
];
export function ageBuckets(days: number[]) {
  return AGE_BUCKETS.map((bucket, i) => ({
    label: bucket.label,
    count: days.filter(
      (d) => d < bucket.max && (i === 0 || d >= AGE_BUCKETS[i - 1].max),
    ).length,
  }));
}
export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
/** Whole days between each dated event and the dated event before it. */
export function eventGaps(a: Application) {
  let previous: string | null = null;
  return a.events.map((e) => {
    const gap = e.date && previous ? daysBetween(previous, e.date) : null;
    if (e.date) previous = e.date;
    return gap;
  });
}

/* Conversion. A response means the employer moved the application past
   Applied; a rejection with no interview is silence that got an answer. */
export function advanced(a: Application) {
  return (
    a.status === "offer" ||
    recordedStages(a).some((s) => s !== "applied") ||
    a.events.some((e) => e.kind === "invitation" || e.kind === "interview")
  );
}
export function conversion(apps: Application[]) {
  const responded = apps.filter(advanced).length;
  return {
    applied: apps.length,
    responded,
    offers: apps.filter((a) => a.status === "offer").length,
    rate: apps.length ? responded / apps.length : null,
  };
}
/** Response rate per place, with a rank band against the other places. */
export function placeConversion<T extends { id: string; ids: string[] }>(
  places: T[],
  apps: Application[],
) {
  const byId = new Map(apps.map((a) => [a.id, a]));
  const rows = places.map((place) => ({
    ...place,
    ...conversion(
      place.ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
    ),
  }));
  const rates = rows.filter((r) => r.rate !== null).map((r) => r.rate!);
  const mid = median(rates) ?? 0;
  return rows.map((row) => ({
    ...row,
    band:
      row.rate === null || row.applied < 3
        ? ("few" as const)
        : row.rate === 0
          ? ("none" as const)
          : row.rate >= mid && row.rate > 0
            ? ("above" as const)
            : ("below" as const),
  }));
}
export function arrangementConversion(apps: Application[]) {
  const remote = apps.filter(isRemote),
    onsite = apps.filter((a) => !isRemote(a));
  return [
    { id: "remote", label: "Remote", ...conversion(remote) },
    { id: "onsite", label: "On-site and hybrid", ...conversion(onsite) },
  ];
}
export function formatRate(rate: number | null) {
  if (rate === null) return "—";
  const pct = rate * 100;
  return `${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%`;
}

/* Cadence: what went out each week against what came back. */
export function weekStart(date: string) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function weeklyCadence(apps: Application[], weeks = 12, asOf = today()) {
  const start = new Date(weekStart(asOf) + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - 7 * (weeks - 1));
  const rows = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + 7 * i);
    return { week: d.toISOString().slice(0, 10), applied: 0, responses: 0 };
  });
  const index = new Map(rows.map((r, i) => [r.week, i]));
  for (const a of apps) {
    const submitted = submittedOn(a);
    if (submitted && index.has(weekStart(submitted)))
      rows[index.get(weekStart(submitted))!].applied++;
    for (const e of a.events)
      if (e.date && e.kind !== "submission" && e.kind !== "note") {
        const i = index.get(weekStart(e.date));
        if (i !== undefined) rows[i].responses++;
      }
  }
  return rows;
}

/* What landed since the last visit, by what it means for the seeker. */
export function sinceDigest(apps: Application[], since: string) {
  const landed = (kind: Application["events"][number]["kind"]) =>
    apps.filter((a) =>
      a.events.some((e) => e.kind === kind && e.date && e.date > since),
    );
  const decisions = landed("decision");
  return {
    rejected: decisions.filter((a) => a.status === "rejected"),
    closed: decisions.filter((a) => a.status === "closed"),
    offers: decisions.filter((a) => a.status === "offer"),
    invitations: landed("invitation"),
    interviews: landed("interview"),
  };
}
/** The outcome orb an application belongs to. Silence of 30 days or more
    shows as "No reply" without changing the record; an interview or offer
    belongs to no outcome orb. */
export function outcomeOf(a: Application, asOf = today()): Outcome | null {
  if (a.status === "pending") return isStale(a, asOf) ? "noreply" : "pending";
  if (a.status === "rejected" || a.status === "closed") return a.status;
  return null;
}
