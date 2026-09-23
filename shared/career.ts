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
/** An agent's sorting of a discovered role. `top` marks a strong fit or high
    pay so the user can see it; it does not stop the work. Every non-skip role
    is approved under the grant unless the user puts it on `hold`. Only the
    user sets hold, and an agent's re-sort never clears a user decision. */
export const triageSchema = z.object({
  tier: z.enum(["top", "standard", "skip"]),
  score: z.number().min(0).max(100).nullable().default(null),
  reason: z.string().max(4000).default(""),
  decidedBy: z.enum(["agent", "user"]),
  decidedAt: date,
  decision: z.enum(["approved", "hold", "skipped"]).default("approved"),
});
export type Triage = z.infer<typeof triageSchema>;
/** Someone read the full posting and checked it before a submission: pay,
    location, eligibility, duplicates. `begin-submit` refuses without a pass. */
export const vettingSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  checks: z.array(z.string().max(200)).min(1).max(20),
  note: z.string().max(4000).default(""),
  by: z.enum(["agent", "user"]),
  at: date,
});
export type Vetting = z.infer<typeof vettingSchema>;
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
  vetting: vettingSchema.nullable().default(null),
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
/** An employer's stated limit on applications, e.g. three per 90 days. The
    source quotes the employer wording or names who reported it. */
export const companyPolicySchema = z.object({
  companyKey: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  maxApplications: z.number().int().min(1).max(100),
  windowDays: z.number().int().min(1).max(730),
  source: z.string().min(1).max(2000),
  note: z.string().max(4000).default(""),
  recordedAt: date,
});
export type CompanyPolicy = z.infer<typeof companyPolicySchema>;
const submittedLifecycles = ["confirmed", "attempted", "uncertain"];
/** Where a company stands against its policy at `now`. Attempts without a
    date are counted inside the window; they cannot be shown to be outside it. */
export function companyStanding(
  policy: CompanyPolicy,
  opportunities: Opportunity[],
  now: string,
  excludeId: string | null = null,
) {
  const start = Date.parse(now) - policy.windowDays * 86_400_000;
  const dated: number[] = [];
  let undated = 0;
  for (const o of opportunities) {
    if (
      o.id === excludeId ||
      o.companyKey !== policy.companyKey ||
      !submittedLifecycles.includes(o.lifecycle)
    )
      continue;
    if (!o.submittedAt) {
      if (o.lifecycle !== "confirmed") undated++;
      continue;
    }
    const t = Date.parse(o.submittedAt);
    if (t >= start) dated.push(t);
  }
  const used = dated.length + undated;
  const atCap = used >= policy.maxApplications;
  const oldest = dated.length ? Math.min(...dated) : null;
  return {
    used,
    max: policy.maxApplications,
    windowDays: policy.windowDays,
    atCap,
    nextEligibleAt:
      atCap && oldest !== null && !undated
        ? new Date(oldest + policy.windowDays * 86_400_000).toISOString()
        : null,
    undated,
  };
}
export type CompanyStanding = ReturnType<typeof companyStanding>;
/** The queue: sorted roles nobody has applied to yet, including ones the user holds. */
export function isQueued(o: Opportunity) {
  return (
    !!o.triage &&
    o.triage.tier !== "skip" &&
    o.triage.decision !== "skipped" &&
    ["discovered", "prepared"].includes(o.lifecycle)
  );
}
/** Cleared: queued and not held, so an agent may apply under the grant. */
export function isCleared(o: Opportunity) {
  return isQueued(o) && o.triage!.decision !== "hold";
}
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
  companyPolicies: CompanyPolicy[];
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
    "vet",
    "company-policy",
  ]),
  payload: z.record(z.string(), z.unknown()),
});
