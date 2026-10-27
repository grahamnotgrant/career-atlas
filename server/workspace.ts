import type { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { transaction } from "./transaction";
import { createHash } from "node:crypto";
import {
  workspaceCommandSchema,
  workspaceRecordsSchema,
  initialWorkspaceRecords,
  runSchema,
  questionSchema,
  sourceSchema,
  factSchema,
  materialSchema,
  type WorkspaceState,
  type WorkspaceRecords,
  type ExportHealth,
} from "../shared/workspace";
class Conflict extends Error {
  statusCode = 409;
}
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const text = z.string().trim().min(1).max(20000);
export function migrateWorkspace(db: DatabaseSync) {
  const tx = transaction(db);
  try {
    db.exec(
      "CREATE TABLE IF NOT EXISTS workspace_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS workspace_commands(id TEXT PRIMARY KEY,request TEXT NOT NULL,response TEXT NOT NULL); CREATE TABLE IF NOT EXISTS workspace_audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,command_id TEXT NOT NULL,body TEXT NOT NULL);",
    );
    db.prepare("INSERT OR IGNORE INTO workspace_state VALUES(1,0,?)").run(
      JSON.stringify(initialWorkspaceRecords),
    );
    db.exec("PRAGMA user_version=5");
    tx.commit();
  } catch (error) {
    tx.rollback();
    throw error;
  }
}
export class WorkspaceStore {
  constructor(
    private db: DatabaseSync,
    private dir: string,
  ) {}
  revision() {
    return (
      this.db
        .prepare("SELECT revision FROM workspace_state WHERE id=1")
        .get() as { revision: number }
    ).revision;
  }
  history(after = 0, limit = 100) {
    after = z.number().int().nonnegative().parse(after);
    limit = z.number().int().min(1).max(200).parse(limit);
    const rows = this.db
      .prepare(
        "SELECT seq,at,body FROM workspace_audit WHERE seq>? ORDER BY seq LIMIT ?",
      )
      .all(after, limit + 1) as { seq: number; at: string; body: string }[];
    const events = rows.slice(0, limit).map((row) => ({
      seq: row.seq,
      at: row.at,
      command: workspaceCommandSchema.parse(JSON.parse(row.body)),
    }));
    return {
      events,
      cursor: events.at(-1)?.seq ?? after,
      hasMore: rows.length > limit,
    };
  }
  exportHealth(): ExportHealth {
    const health: ExportHealth = {
      state: "unavailable",
      generation: null,
      careerRevision: null,
      workspaceRevision: null,
      exportedAt: null,
      path: null,
      message: "No spreadsheet export has been recorded.",
    };
    const path = join(this.dir, "exports", "workbook-status.json");
    if (!existsSync(path)) return health;
    try {
      if (statSync(path).size > 1024 * 1024)
        throw new Error("Export status is too large.");
      const raw = JSON.parse(readFileSync(path, "utf8"));
      if (raw.state === "error")
        return {
          ...health,
          state: "error",
          message:
            typeof raw.message === "string"
              ? raw.message
              : "Spreadsheet export failed.",
        };
      const revisions = raw.revisions ?? {};
      const number = (v: unknown) =>
        v !== null && v !== undefined && Number.isFinite(Number(v))
          ? Number(v)
          : null;
      const generation = number(revisions.generation),
        careerRevision = number(revisions.career_state),
        workspaceRevision = number(revisions.workspace_state);
      const currentGeneration = Number(
        (
          this.db
            .prepare("SELECT value FROM metadata WHERE key='generation'")
            .get() as { value: string } | undefined
        )?.value ?? 0,
      );
      const currentCareer = (
        this.db
          .prepare("SELECT revision FROM career_state WHERE id=1")
          .get() as { revision: number }
      ).revision;
      const current =
        raw.state === "current" &&
        generation === currentGeneration &&
        careerRevision === currentCareer &&
        workspaceRevision === this.revision();
      return {
        state: current ? "current" : "pending",
        generation,
        careerRevision,
        workspaceRevision,
        exportedAt: typeof raw.createdAt === "string" ? raw.createdAt : null,
        path: typeof raw.path === "string" ? raw.path : null,
        message: current
          ? "Spreadsheet includes current records."
          : "Spreadsheet is waiting to include the latest records.",
      };
    } catch {
      return {
        ...health,
        state: "error",
        message: "Spreadsheet export status could not be read.",
      };
    }
  }
  snapshot(): WorkspaceState {
    const row = this.db
      .prepare("SELECT revision,body FROM workspace_state WHERE id=1")
      .get() as { revision: number; body: string };
    const grantUsage = Object.fromEntries(
      (
        this.db
          .prepare(
            "SELECT json_extract(body,'$.grantId') AS grantId,COUNT(*) AS n FROM career_audit WHERE json_extract(body,'$.action')='begin-submit' GROUP BY json_extract(body,'$.grantId')",
          )
          .all() as { grantId: string; n: number }[]
      )
        .filter((r) => r.grantId)
        .map((r) => [r.grantId, r.n]),
    );
    return {
      ...workspaceRecordsSchema.parse(JSON.parse(row.body)),
      revision: row.revision,
      exportHealth: this.exportHealth(),
      grantUsage,
    };
  }
  command(raw: unknown) {
    const c = workspaceCommandSchema.parse(raw),
      tx = transaction(this.db);
    try {
      const prior = this.db
        .prepare("SELECT request,response FROM workspace_commands WHERE id=?")
        .get(c.id) as { request: string; response: string } | undefined;
      if (prior) {
        if (prior.request !== JSON.stringify(c))
          throw new Conflict("Command ID reused with different arguments.");
        tx.commit();
        return JSON.parse(prior.response);
      }
      const state = this.snapshot();
      if (c.expectedRevision !== state.revision)
        throw new Conflict(
          "Workspace records changed. Read the current revision.",
        );
      const now = new Date().toISOString(),
        p = c.payload;
      const put = <T extends { id: string }>(rows: T[], value: T) => {
        const index = rows.findIndex((x) => x.id === value.id);
        if (index < 0) rows.push(value);
        else rows[index] = value;
        return value;
      };
      const requireRun = (runId: string) => {
        const run = state.runs.find((r) => r.id === runId);
        if (!run) throw new Conflict("Run not found.");
        return run;
      };
      const requireOwner = (runId: string) => {
        const run = requireRun(runId);
        if (run.owner !== c.actor)
          throw new Conflict("Run belongs to another agent.");
        return run;
      };
      const requirePerson = () => {
        if (c.actor !== "person")
          throw new Conflict("A person decision is required.");
      };
      let result: unknown;
      switch (c.action) {
        case "run": {
          const input = runSchema
            .omit({ createdAt: true, updatedAt: true, heartbeatAt: true })
            .partial({
              phase: true,
              recordIds: true,
              outputs: true,
              nextAction: true,
            })
            .extend({ heartbeatAt: z.iso.datetime().nullable().optional() })
            .parse(p.run);
          const provided = z.record(z.string(), z.unknown()).parse(p.run);
          const patch = Object.fromEntries(
            Object.entries(input).filter(([key]) =>
              Object.hasOwn(provided, key),
            ),
          );
          const old = state.runs.find((r) => r.id === input.id);
          if (old && old.owner !== c.actor)
            throw new Conflict("Run belongs to another agent.");
          if (input.owner !== c.actor)
            throw new Conflict("Run owner must match the command actor.");
          result = put(
            state.runs,
            runSchema.parse({
              ...old,
              ...patch,
              heartbeatAt: input.heartbeatAt ?? now,
              createdAt: old?.createdAt ?? now,
              updatedAt: now,
            }),
          );
          break;
        }
        case "question": {
          const input = questionSchema
            .omit({
              createdAt: true,
              updatedAt: true,
              status: true,
              answer: true,
              answeredBy: true,
              history: true,
            })
            .parse(p.question);
          if (input.kind === "choice" && !input.options.length)
            throw new Conflict("Choice questions need options.");
          if (input.runId) requireOwner(input.runId);
          const old = state.questions.find((q) => q.id === input.id);
          if (old) {
            if (
              old.prompt !== input.prompt ||
              JSON.stringify(old.support) !== JSON.stringify(input.support) ||
              old.runId !== input.runId ||
              old.kind !== input.kind ||
              JSON.stringify(old.options) !== JSON.stringify(input.options) ||
              JSON.stringify(old.recordIds) !== JSON.stringify(input.recordIds)
            )
              throw new Conflict(
                "Question identity already exists. Preserve its exact prompt, choices, support and dependencies.",
              );
            result = old;
            break;
          }
          result = put(
            state.questions,
            questionSchema.parse({ ...input, createdAt: now, updatedAt: now }),
          );
          break;
        }
        case "answer":
        case "dismiss-question": {
          requirePerson();
          const question = state.questions.find((q) => q.id === id.parse(p.id));
          if (!question) throw new Conflict("Question not found.");
          if (question.status !== "open")
            throw new Conflict(
              "Question is already resolved. Preserve its answer history.",
            );
          const answer = text.parse(
            c.action === "answer" ? p.answer : p.reason,
          );
          if (
            c.action === "answer" &&
            question.kind === "choice" &&
            !question.options.includes(answer)
          )
            throw new Conflict("Choose one of the recorded options.");
          question.status = c.action === "answer" ? "answered" : "dismissed";
          question.answer = answer;
          question.answeredBy = c.actor;
          question.updatedAt = now;
          question.history.push({
            at: now,
            actor: c.actor,
            status: question.status,
            answer,
          });
          result = question;
          break;
        }
        case "steer": {
          requirePerson();
          const input = z
            .object({
              instruction: text,
              runId: id.nullable().optional(),
              recordIds: z.array(id).max(1000).optional(),
            })
            .strict()
            .parse(p);
          if (input.runId) requireRun(input.runId);
          result = put(state.steering, {
            id: c.id,
            instruction: input.instruction,
            runId: input.runId ?? null,
            recordIds: input.recordIds ?? [],
            status: "pending",
            owner: null,
            message: "Waiting for an agent to acknowledge this instruction.",
            createdAt: now,
            updatedAt: now,
          });
          break;
        }
        case "steering-state": {
          const input = z
            .object({
              id,
              status: z.enum(["acknowledged", "completed", "failed"]),
              message: z.string().max(4000).default(""),
            })
            .strict()
            .parse(p);
          const item = state.steering.find((x) => x.id === input.id);
          if (!item) throw new Conflict("Instruction not found.");
          if (c.channel !== "agent")
            throw new Conflict(
              "Only the handling agent can acknowledge delivery.",
            );
          if (item.runId) requireOwner(item.runId);
          if (item.owner && item.owner !== c.actor)
            throw new Conflict("Instruction belongs to another agent.");
          if (item.status === "completed" || item.status === "failed")
            throw new Conflict("Instruction is already resolved.");
          if (item.status === "pending" && input.status === "completed")
            throw new Conflict(
              "Acknowledge the instruction before completing it.",
            );
          item.owner = c.actor;
          item.status = input.status;
          item.message = input.message;
          item.updatedAt = now;
          result = item;
          break;
        }
        case "source": {
          const input = sourceSchema
              .omit({ lastSuccessful: true })
              .parse(p.source),
            old = state.sources.find((s) => s.id === input.id);
          if (
            input.checkedFrom &&
            input.checkedThrough &&
            Date.parse(input.checkedFrom) > Date.parse(input.checkedThrough)
          )
            throw new Conflict("Source window ends before it starts.");
          if (old && Date.parse(input.checkedAt) < Date.parse(old.checkedAt))
            throw new Conflict("Source check predates its saved checkpoint.");
          result = put(state.sources, {
            ...input,
            lastSuccessful:
              input.coverage === "complete"
                ? {
                    checkedAt: input.checkedAt,
                    checkedThrough: input.checkedThrough,
                    cursor: input.cursor,
                  }
                : old?.scope === input.scope &&
                    old.kind === input.kind &&
                    old.authorizationRef === input.authorizationRef
                  ? old.lastSuccessful
                  : null,
          });
          break;
        }
        case "fact": {
          const input = factSchema
              .omit({ createdAt: true, updatedAt: true, wordingApproval: true })
              .parse(p.fact),
            old = state.facts.find((f) => f.id === input.id);
          const approval =
            old &&
            old.wording === input.wording &&
            old.observation === input.observation &&
            old.contribution === input.contribution &&
            old.ownership === input.ownership &&
            old.outcome === input.outcome &&
            JSON.stringify(old.support) === JSON.stringify(input.support)
              ? old.wordingApproval
              : null;
          result = put(state.facts, {
            ...input,
            wordingApproval: approval,
            createdAt: old?.createdAt ?? now,
            updatedAt: now,
          });
          break;
        }
        case "approve-fact": {
          requirePerson();
          const input = z.object({ id, wording: text }).strict().parse(p),
            fact = state.facts.find((f) => f.id === input.id);
          if (!fact) throw new Conflict("Fact not found.");
          if (fact.ownership === "unresolved" || fact.ownership === "disputed")
            throw new Conflict(
              "Resolve personal contribution before approving wording.",
            );
          if (!fact.support.length)
            throw new Conflict(
              "A supporting source is required before wording approval.",
            );
          if (fact.wording !== input.wording)
            throw new Conflict("Approve the exact current wording.");
          fact.wordingApproval = {
            text: input.wording,
            approvedAt: now,
            by: c.actor,
          };
          fact.updatedAt = now;
          result = fact;
          break;
        }
        case "material": {
          const input = materialSchema
              .omit({ createdAt: true, updatedAt: true })
              .parse(p.material),
            old = state.materials.find((m) => m.id === input.id);
          if (!input.opportunityId && !input.applicationId)
            throw new Conflict(
              "Material needs an opportunity or application identity.",
            );
          if (
            input.applicationId &&
            !this.db
              .prepare("SELECT id FROM applications WHERE id=?")
              .get(input.applicationId)
          )
            throw new Conflict("Application not found for material.");
          if (input.opportunityId) {
            const row = this.db
              .prepare("SELECT body FROM opportunities WHERE id=?")
              .get(input.opportunityId) as { body: string } | undefined;
            if (!row) throw new Conflict("Opportunity not found for material.");
            const applicationId = JSON.parse(row.body).applicationId;
            if (input.applicationId && applicationId !== input.applicationId)
              throw new Conflict(
                "Material application and opportunity identities do not match.",
              );
          }
          const original = input.originalId
            ? state.materials.find((m) => m.id === input.originalId)
            : null;
          if (
            original &&
            (original.applicationId !== input.applicationId ||
              original.opportunityId !== input.opportunityId ||
              original.attemptKey !== input.attemptKey)
          )
            throw new Conflict(
              "Derivative material must reference the same application attempt.",
            );
          if (input.coverage === "verified" && !input.sha256) {
            let sourcedLink = false;
            try {
              const url = new URL(input.reference);
              sourcedLink =
                input.mediaType === "text/uri-list" &&
                ["http:", "https:"].includes(url.protocol) &&
                input.support.length > 0;
            } catch {
              /* Not an identifiable submitted URL. */
            }
            const exactAnswers =
              input.role === "answer" &&
              input.questions.length > 0 &&
              input.questions.every(
                (q) =>
                  q.status !== "uncaptured" &&
                  (q.status !== "answered" || q.answer.trim().length > 0),
              );
            if (!sourcedLink && !exactAnswers)
              throw new Conflict(
                "Verified material needs byte identity, a sourced submitted URL, or an exact answer inventory. Record recovery-needed coverage for missing material.",
              );
          }
          if (input.coverage === "verified" && input.sha256) {
            let data: Buffer;
            try {
              data = readFileSync(join(this.dir, "artifacts", input.sha256));
            } catch {
              throw new Conflict(
                "Verified material artifact is missing. Preserve it or record recovery-needed coverage.",
              );
            }
            if (
              createHash("sha256").update(data).digest("hex") !== input.sha256
            )
              throw new Conflict("Material artifact hash mismatch.");
          }
          if (
            input.originalId &&
            !state.materials.some(
              (m) => m.id === input.originalId && m.id !== input.id,
            )
          )
            throw new Conflict("Original material not found.");
          if (
            old &&
            JSON.stringify({
              ...old,
              createdAt: undefined,
              updatedAt: undefined,
            }) !== JSON.stringify(input)
          )
            throw new Conflict(
              "Material identity is immutable. Record a new version.",
            );
          result =
            old ??
            put(state.materials, { ...input, createdAt: now, updatedAt: now });
          break;
        }
        case "import-session": {
          const session = z
            .object({
              sessionId: id,
              skill: z.string().max(200).default("legacy"),
              status: z.string().max(100).default("in_progress"),
              completed: z.array(z.unknown()).max(10000).default([]),
              openQuestions: z.array(z.unknown()).max(1000).default([]),
              nextAction: z.string().max(2000).default(""),
              selectedRecordIds: z.array(id).max(1000).default([]),
              phases: z.array(z.unknown()).max(1000).default([]),
              updatedAt: z.string().optional(),
            })
            .passthrough()
            .parse(p.session);
          const runId = `import-${createHash("sha256").update(session.sessionId).digest("hex").slice(0, 48)}`,
            old = state.runs.find((r) => r.id === runId);
          if (old) {
            requireOwner(runId);
            result = { runId, imported: false };
            break;
          }
          const status =
            session.status === "complete"
              ? "complete"
              : session.status === "cancelled"
                ? "cancelled"
                : session.status === "waiting_for_user"
                  ? "waiting"
                  : "interrupted";
          put(
            state.runs,
            runSchema.parse({
              id: runId,
              operation: session.skill,
              label: `Resumed ${session.skill}`,
              legacySession: session,
              owner: c.actor,
              status,
              phase: "Imported session",
              createdAt: now,
              updatedAt: now,
              recordIds: session.selectedRecordIds,
              outputs: session.completed
                .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
                .map((x) => x.slice(0, 2000))
                .slice(0, 100),
              nextAction: session.nextAction,
            }),
          );
          for (const [index, value] of session.openQuestions.entries()) {
            const q =
              typeof value === "string"
                ? { question: value }
                : (value as Record<string, unknown>);
            if (!q || typeof q !== "object") continue;
            const prompt =
              typeof q.question === "string"
                ? q.question
                : typeof q.prompt === "string"
                  ? q.prompt
                  : null;
            if (!prompt) continue;
            const qid = `${runId}-q-${index}`.slice(0, 100);
            if (state.questions.some((q) => q.id === qid)) continue;
            const answered = q.status === "resolved" || q.status === "answered";
            const answer =
              typeof q.answer === "string"
                ? q.answer
                : typeof q.resolution === "string"
                  ? q.resolution
                  : null;
            put(
              state.questions,
              questionSchema.parse({
                id: qid,
                prompt,
                runId,
                status: answered && answer ? "answered" : "open",
                answer: answered ? answer : null,
                answeredBy: answered && answer ? c.actor : null,
                createdAt: now,
                updatedAt: now,
              }),
            );
          }
          result = { runId, imported: true };
          break;
        }
      }
      const records: WorkspaceRecords = {
        protocolVersion: 1,
        runs: state.runs,
        questions: state.questions,
        steering: state.steering,
        sources: state.sources,
        facts: state.facts,
        materials: state.materials,
      };
      workspaceRecordsSchema.parse(records);
      this.db
        .prepare(
          "UPDATE workspace_state SET revision=revision+1,body=? WHERE id=1",
        )
        .run(JSON.stringify(records));
      const response = { revision: state.revision + 1, result };
      this.db
        .prepare(
          "INSERT INTO workspace_audit(at,command_id,body) VALUES(?,?,?)",
        )
        .run(now, c.id, JSON.stringify(c));
      this.db
        .prepare("INSERT INTO workspace_commands VALUES(?,?,?)")
        .run(c.id, JSON.stringify(c), JSON.stringify(response));
      tx.commit();
      return response;
    } catch (error) {
      tx.rollback();
      throw error;
    }
  }
}
