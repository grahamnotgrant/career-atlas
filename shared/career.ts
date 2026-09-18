import { z } from "zod";
/** Stable grouping key; punctuation and spacing do not split one employer. */
export function companyIdentity(company: string) {
  return (
    company
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "") || company.trim().toLowerCase()
  );
}
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const text = z.string().max(100000);
const date = z.iso.datetime();
export const lifecycleSchema = z.enum([
  "discovered",
  "prepared",
  "attempted",
  "blocked",
  "uncertain",
  "confirmed",
]);
export const provenanceSchema = z.object({
  id,
  kind: z.enum(["employer", "user", "hypothesis", "source"]),
  text,
  source: z.string().max(2000),
  recordedAt: date,
});
/** An agent's sorting of a discovered role: `review` waits for the user,
    `auto` may proceed under an active grant, `skip` is set aside. Only the
    user's decision moves a `review` role forward. */
export const triageSchema = z.object({
  tier: z.enum(["review", "auto", "skip"]),
  score: z.number().min(0).max(100).nullable().default(null),
  reason: z.string().max(4000).default(""),
  decidedBy: z.enum(["agent", "user"]),
  decidedAt: date,
  decision: z.enum(["pending", "approved", "skipped"]).default("pending"),
});
export type Triage = z.infer<typeof triageSchema>;
export const opportunitySchema = z.object({
  id,
  company: z.string().min(1).max(200),
  companyKey: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  jobKey: z.string().min(1).max(1000),
  url: z
    .string()
    .max(2000)
    .refine(
      (v) =>
        !v ||
        (() => {
          try {
            return ["http:", "https:"].includes(new URL(v).protocol);
          } catch {
            return false;
          }
        })(),
      "Job URL must use http or https.",
    ),
  description: text,
  roleFamilyId: id.nullable().default(null),
  location: z.string().max(300),
  workArrangement: z
    .enum(["remote", "hybrid", "onsite", "unknown"])
    .default("unknown"),
  compensation: z
    .object({
      currency: z.string().length(3),
      annualBase: z.number().nonnegative().nullable(),
      annualCash: z.number().nonnegative().nullable(),
    })
    .nullable()
    .default(null),
  lifecycle: lifecycleSchema.default("discovered"),
  submittedAt: date.nullable().default(null),
  applicationId: id.nullable().default(null),
  offer: z
    .object({
      currency: z.string().length(3),
      base: z.number().nonnegative().nullable(),
      bonus: z.number().nonnegative().nullable(),
      equity: z.string().max(4000),
      location: z.string().max(300),
      deadline: z.iso.date().nullable(),
      decision: z.enum(["pending", "accepted", "declined", "expired"]),
    })
    .nullable()
    .default(null),
  provenance: z.array(provenanceSchema).default([]),
  triage: triageSchema.nullable().default(null),
  templateId: id.nullable().default(null),
  materialHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).default([]),
  answers: text.default(""),
});
export const settingsSchema = z.object({
  goals: text.default(""),
  experience: text.default(""),
  evidence: text.default(""),
  exclusions: z.array(z.string().max(200)).default([]),
  locations: z.array(z.string().max(300)).default([]),
  compensationFloors: z
    .array(
      z.object({
        locations: z.array(z.string().min(1).max(300)).min(1),
        annualBase: z.number().nonnegative(),
        annualCash: z.number().nonnegative().nullable().default(null),
        currency: z.string().length(3),
      }),
    )
    .default([]),
  compensationFloor: z.number().nonnegative().nullable().default(null),
  currency: z.string().length(3).default("USD"),
  workArrangements: z.array(z.enum(["remote", "hybrid", "onsite"])).default([]),
  capabilities: z.record(z.string(), z.boolean()).default({}),
  onboardingStep: z
    .enum([
      "goals",
      "evidence",
      "preferences",
      "templates",
      "authorization",
      "complete",
    ])
    .default("goals"),
});
export const familySchema = z.object({
  id,
  name: z.string().min(1).max(200),
  rank: z.number().int().min(1).max(20),
  evidence: z.array(z.string().min(1).max(2000)).min(1),
  rationale: text,
});
export const templateSchema = z.object({
  id,
  familyId: id,
  version: z.number().int().positive(),
  content: text,
  claims: z.array(z.string().min(1).max(2000)),
  approvedAt: date.nullable().default(null),
  approvalNote: text.default(""),
});
export const grantSchema = z.object({
  id,
  roleFamilyIds: z.array(id).min(1),
  locations: z.array(z.string().min(1).max(300)).min(1),
  exclusions: z.array(z.string().min(1).max(200)),
  minAnnualBase: z.number().nonnegative(),
  currency: z.string().length(3),
  expiresAt: date,
  maxApplications: z.number().int().min(1).max(10000),
  approvedAt: date,
  approvalNote: z.string().min(1).max(2000),
  state: z.enum(["active", "paused", "revoked"]).default("active"),
});
export type Opportunity = z.infer<typeof opportunitySchema>;
export type CareerSettings = z.infer<typeof settingsSchema>;
export type RoleFamily = z.infer<typeof familySchema>;
export type ResumeTemplate = z.infer<typeof templateSchema>;
export type Grant = z.infer<typeof grantSchema>;
export interface CareerState {
  revision: number;
  settings: CareerSettings;
  opportunities: Opportunity[];
  families: RoleFamily[];
  templates: ResumeTemplate[];
  grants: Grant[];
  claims: {
    opportunityId: string;
    owner: string;
    fence: number;
    expiresAt: string;
    grantId: string;
  }[];
}
export const careerCommandSchema = z.object({
  id,
  expectedRevision: z.number().int().nonnegative(),
  action: z.enum([
    "settings",
    "families",
    "opportunities",
    "template",
    "approve-template",
    "grant",
    "grant-state",
    "claim",
    "renew",
    "release",
    "prepare",
    "begin-submit",
    "result",
    "reconcile",
    "confirm",
    "annotate",
    "triage",
    "decide",
  ]),
  payload: z.record(z.string(), z.unknown()),
});
