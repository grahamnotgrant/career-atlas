import type { Application, Stage, Status } from "../shared/model";
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
    angle: 145,
    start: 120,
    end: 176,
    color: "#b59aff",
  },
  {
    id: "rejected",
    label: "Rejected",
    angle: 90,
    start: 65,
    end: 115,
    color: "#ff969f",
  },
  {
    id: "closed",
    label: "Closed / withdrawn",
    angle: 35,
    start: 4,
    end: 60,
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
    .filter((s, i, all) => i === 0 || s !== all[i - 1]);
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
export function outcomeBreakdown(apps: Application[], status: Status) {
  const members = apps.filter((a) => a.status === status);
  const counts = new Map<string, number>();
  for (const a of members) {
    const label = unknownStage(a)
      ? "Interview stage unknown"
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
      a.submitted.localeCompare(b.submitted) || a.id.localeCompare(b.id),
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
      const pool = pools.find((p) => p.id === a.status)!;
      const dot = slot % 8;
      endAngle =
        dot < 4
          ? pool.start + 4 + (dot * (pool.angle - 13 - pool.start)) / 3
          : pool.angle + 9 + ((dot - 4) * (pool.end - pool.angle - 13)) / 3;
      color = pool.color;
    }
    let end = polar(endAngle, 285 + Math.floor(slot / 8) * 18);
    if (a.status !== "interview" && a.status !== "offer") {
      const terminal = polar(pools.find((p) => p.id === a.status)!.angle);
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
            a.submitted.localeCompare(b.submitted) || a.id.localeCompare(b.id),
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

export function connections(apps: Application[]) {
  const edges = new Map<
    string,
    { id: string; from: string; to: string; ids: string[]; uncertain: number }
  >();
  for (const a of apps) {
    const stages = recordedStages(a);
    const nodes: string[] = [...stages];
    if (a.status === "offer" && nodes.at(-1) !== "offer") nodes.push("offer");
    if (["pending", "rejected", "closed"].includes(a.status))
      nodes.push(a.status);
    for (let i = 1; i < nodes.length; i++) {
      const from = nodes[i - 1],
        to = nodes[i];
      if (from === to) continue;
      const id = from + ":" + to,
        edge = edges.get(id) ?? { id, from, to, ids: [], uncertain: 0 };
      if (!edge.ids.includes(a.id)) {
        edge.ids.push(a.id);
        if (unknownStage(a) && i === nodes.length - 1) edge.uncertain++;
      }
      edges.set(id, edge);
    }
  }
  return [...edges.values()];
}
export function connectionPoint(id: string, city = false) {
  const node = [...hubs, ...pools].find((h) => h.id === id)!;
  if (city) {
    const stageIndex = hubs.findIndex((h) => h.id === id);
    const outcomeIndex = pools.findIndex((p) => p.id === id);
    return {
      x: stageIndex >= 0 ? 175 + stageIndex * 250 : 300 + outcomeIndex * 375,
      y: stageIndex >= 0 ? 155 : 675,
      color: node.color,
    };
  }
  return { ...polar(node.angle), color: node.color };
}
