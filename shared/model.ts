import { sceneIds, sceneCatalog } from "./locations";
import { z } from "zod";
export const stageSchema = z.enum([
  "applied",
  "recruiter",
  "hiring",
  "case",
  "offer",
]);
export const statusSchema = z.enum([
  "pending",
  "interview",
  "rejected",
  "closed",
  "offer",
]);
export const themeSchema = z.enum(sceneIds);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const day = z.iso.date();
export const evidenceSchema = z.object({
  id,
  label: z.string().min(1).max(200),
  kind: z.enum(["receipt", "resume", "feedback", "note"]),
  text: z.string().max(100000),
  basis: z.string().max(500),
  file: z.string().optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  mediaType: z.enum(["application/pdf", "text/plain"]).optional(),
});
export const eventSchema = z.object({
  id,
  stage: stageSchema.nullable(),
  date: day.nullable(),
  label: z.string().max(200),
  detail: z.string().max(4000),
  evidenceIds: z.array(id),
  kind: z.enum(["submission", "invitation", "interview", "decision", "note"]),
});
export const applicationSchema = z.object({
  id,
  company: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  location: z.string().max(200),
  theme: themeSchema,
  compensation: z.string().max(1000),
  status: statusSchema,
  submitted: day,
  asOf: day,
  verification: z.string().max(500),
  events: z.array(eventSchema).min(1),
  evidence: z.array(evidenceSchema),
});
export const manifestSchema = z
  .object({
    version: z.literal(1),
    label: z.string().min(1).max(200),
    mode: z.enum(["private", "demo"]),
    coverage: z.string().max(2000),
    applications: z.array(applicationSchema).min(1).max(10000),
  })
  .superRefine((m, ctx) => {
    const all = new Set<string>();
    for (const a of m.applications) {
      for (const item of [a, ...a.events, ...a.evidence]) {
        if (all.has(item.id))
          ctx.addIssue({ code: "custom", message: `Duplicate ID: ${item.id}` });
        all.add(item.id);
      }
      const ids = new Set(a.evidence.map((e) => e.id));
      if (
        !a.events.some((e) => e.kind === "submission" && e.stage === "applied")
      )
        ctx.addIssue({ code: "custom", message: "Submission event required" });
      for (const e of a.events)
        for (const ref of e.evidenceIds)
          if (!ids.has(ref))
            ctx.addIssue({
              code: "custom",
              message: `Missing evidence reference: ${ref}`,
            });
    }
  });
export type Application = z.infer<typeof applicationSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type Status = z.infer<typeof statusSchema>;
export const viewSchema = z.object({
  revision: z.number().int().nonnegative(),
  selectedId: id.nullable(),
  theme: themeSchema,
  city: themeSchema.nullable().default(null),
  themeLocked: z.boolean(),
  motion: z.boolean(),
  status: z.union([statusSchema, z.literal("all")]),
  query: z.string().max(200),
  list: z.boolean(),
  flowIds: z.array(id).nullable(),
  evidenceId: id.nullable(),
});
export type View = z.infer<typeof viewSchema>;
export const initialView: View = {
  revision: 0,
  selectedId: null,
  theme: "neutral",
  city: null,
  themeLocked: false,
  motion: true,
  status: "all",
  query: "",
  list: false,
  flowIds: null,
  evidenceId: null,
};
export const commandSchema = z.object({
  id: z.string().min(1).max(100),
  expectedRevision: z.number().int().nonnegative(),
  action: z.enum([
    "location",
    "select",
    "theme",
    "motion",
    "filter",
    "list",
    "flow",
    "reset",
    "document",
    "back",
    "close",
  ]),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type Command = z.infer<typeof commandSchema>;
export interface HomeLocation {
  status: "resume" | "unset" | "conflict" | "unreadable";
  label: string | null;
  coordinates: [number, number] | null;
  evidenceIds: string[];
}
export interface Snapshot {
  homeLocation: HomeLocation;
  applications: Application[];
  view: View;
  generation: number;
  label: string;
  mode: "private" | "demo" | "empty";
  coverage: string;
  canGoBack: boolean;
  sync: {
    enabled: boolean;
    state: string;
    checkedAt: string | null;
    added: number;
    message: string;
  };
}
export const statusLabels: Record<Status, string> = {
  pending: "Awaiting response",
  interview: "Interview scheduled",
  rejected: "Rejected",
  closed: "Closed / withdrawn",
  offer: "Offer",
};
export const stageLabels: Record<Stage, string> = {
  applied: "Applied",
  recruiter: "Recruiter",
  hiring: "Hiring manager",
  case: "Case / technical",
  offer: "Offer",
};
export const themeLabels = Object.fromEntries(
  sceneIds.map((id) => [id, sceneCatalog[id].label]),
) as Record<Theme, string>;
export function filtered(apps: Application[], v: View) {
  const q = v.query.toLowerCase().trim();
  return apps.filter(
    (a) =>
      (v.status === "all" || a.status === v.status) &&
      (!q || `${a.company} ${a.title} ${a.location}`.toLowerCase().includes(q)),
  );
}
