import { z } from "zod";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const text = z.string().trim().min(1).max(10000);
const time = z.iso.datetime();
export const supportSchema = z
  .object({
    label: z.string().min(1).max(200),
    reference: z.string().min(1).max(2000),
  })
  .strict();
const supports = z.array(supportSchema).max(100).default([]);
const ids = z.array(id).max(1000).default([]);
export const runSchema = z
  .object({
    id,
    operation: z.string().min(1).max(100),
    label: z.string().min(1).max(200),
    owner: id,
    status: z.enum([
      "running",
      "waiting",
      "interrupted",
      "failed",
      "complete",
      "cancelled",
    ]),
    phase: z.string().max(500).default(""),
    heartbeatAt: time.nullable().default(null),
    legacySession: z.record(z.string(), z.unknown()).nullable().default(null),
    createdAt: time,
    updatedAt: time,
    recordIds: ids,
    outputs: z.array(z.string().max(2000)).max(100).default([]),
    nextAction: z.string().max(2000).default(""),
  })
  .strict();
export const questionSchema = z
  .object({
    id,
    prompt: text,
    kind: z.enum(["text", "choice"]).default("text"),
    options: z.array(z.string().min(1).max(1000)).max(30).default([]),
    support: supports,
    runId: id.nullable().default(null),
    recordIds: ids,
    status: z
      .enum(["open", "answered", "dismissed", "superseded"])
      .default("open"),
    answer: z.string().max(20000).nullable().default(null),
    answeredBy: id.nullable().default(null),
    createdAt: time,
    updatedAt: time,
    history: z
      .array(
        z.object({
          at: time,
          actor: id,
          status: z.string().max(30),
          answer: z.string().max(20000),
        }),
      )
      .max(1000)
      .default([]),
  })
  .strict();
export const steeringSchema = z
  .object({
    id,
    instruction: text,
    runId: id.nullable(),
    recordIds: ids,
    status: z.enum(["pending", "acknowledged", "completed", "failed"]),
    owner: id.nullable(),
    message: z.string().max(4000),
    createdAt: time,
    updatedAt: time,
  })
  .strict();
export const sourceSchema = z
  .object({
    id,
    label: z.string().min(1).max(200),
    kind: z.string().min(1).max(100),
    scope: z.string().min(1).max(2000),
    authorizationRef: z.string().min(1).max(2000),
    coverage: z.enum(["complete", "partial", "unavailable"]),
    checkedAt: time,
    checkedFrom: time.nullable().default(null),
    checkedThrough: time.nullable().default(null),
    cursor: z.string().max(4000).nullable().default(null),
    message: z.string().max(4000).default(""),
    recoveryAction: z.string().max(2000).default(""),
    lastSuccessful: z
      .object({
        checkedAt: time,
        checkedThrough: time.nullable(),
        cursor: z.string().nullable(),
      })
      .nullable()
      .default(null),
  })
  .strict();
export const factSchema = z
  .object({
    id,
    label: z.string().min(1).max(200),
    observation: text,
    contribution: z.string().max(10000).default(""),
    ownership: z
      .enum(["observed", "user-reported", "unresolved", "disputed"])
      .default("unresolved"),
    outcome: z
      .enum([
        "draft",
        "implemented",
        "merged",
        "deployed",
        "used",
        "measured",
        "unknown",
      ])
      .default("unknown"),
    support: supports,
    wording: z.string().max(10000).nullable().default(null),
    wordingApproval: z
      .object({ text, approvedAt: time, by: id })
      .nullable()
      .default(null),
    createdAt: time,
    updatedAt: time,
  })
  .strict();
export const materialSchema = z
  .object({
    id,
    opportunityId: id.nullable().default(null),
    applicationId: id.nullable().default(null),
    attemptKey: id,
    label: z.string().min(1).max(200),
    role: z.enum([
      "resume",
      "cover-letter",
      "portfolio",
      "answer",
      "supplement",
      "receipt",
      "archive",
    ]),
    mediaType: z.string().min(1).max(200),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
      .default(null),
    reference: z.string().max(2000).default(""),
    originalId: id.nullable().default(null),
    support: supports,
    coverage: z.enum([
      "verified",
      "recovery-needed",
      "ambiguous",
      "unavailable",
      "not-applicable",
    ]),
    questions: z
      .array(
        z
          .object({
            prompt: text,
            answer: z.string().max(100000),
            status: z.enum(["answered", "blank", "declined", "uncaptured"]),
          })
          .strict(),
      )
      .max(1000)
      .default([]),
    createdAt: time,
    updatedAt: time,
  })
  .strict();
export interface ExportHealth {
  state: "current" | "pending" | "error" | "unavailable";
  generation: number | null;
  careerRevision: number | null;
  workspaceRevision: number | null;
  exportedAt: string | null;
  path: string | null;
  message: string;
}
export const workspaceRecordsSchema = z
  .object({
    protocolVersion: z.literal(1),
    runs: z.array(runSchema).max(10000),
    questions: z.array(questionSchema).max(10000),
    steering: z.array(steeringSchema).max(10000),
    sources: z.array(sourceSchema).max(1000),
    facts: z.array(factSchema).max(10000),
    materials: z.array(materialSchema).max(10000),
  })
  .strict();
export type AgentRun = z.infer<typeof runSchema>;
export type WorkspaceQuestion = z.infer<typeof questionSchema>;
export type SteeringRequest = z.infer<typeof steeringSchema>;
export type SourceCheckpoint = z.infer<typeof sourceSchema>;
export type WorkFact = z.infer<typeof factSchema>;
export type AttemptMaterial = z.infer<typeof materialSchema>;
export type WorkspaceRecords = z.infer<typeof workspaceRecordsSchema>;
export interface WorkspaceState extends WorkspaceRecords {
  grantUsage: Record<string, number>;
  revision: number;
  exportHealth: ExportHealth;
}
export const initialWorkspaceRecords: WorkspaceRecords = {
  protocolVersion: 1,
  runs: [],
  questions: [],
  steering: [],
  sources: [],
  facts: [],
  materials: [],
};
export const initialWorkspaceState: WorkspaceState = {
  ...initialWorkspaceRecords,
  revision: 0,
  grantUsage: {},
  exportHealth: {
    state: "unavailable",
    generation: null,
    careerRevision: null,
    workspaceRevision: null,
    exportedAt: null,
    path: null,
    message: "No spreadsheet export has been recorded.",
  },
};
export const workspaceCommandSchema = z
  .object({
    id,
    expectedRevision: z.number().int().nonnegative(),
    actor: id,
    channel: z.enum(["app", "agent", "import"]).default("agent"),
    action: z.enum([
      "run",
      "question",
      "answer",
      "dismiss-question",
      "steer",
      "steering-state",
      "source",
      "fact",
      "approve-fact",
      "material",
      "import-session",
    ]),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type WorkspaceCommand = z.infer<typeof workspaceCommandSchema>;
