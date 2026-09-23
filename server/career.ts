import { transaction } from "./transaction";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  careerCommandSchema,
  companyIdentity,
  settingsSchema,
  familySchema,
  opportunitySchema,
  triageSchema,
  vettingSchema,
  templateSchema,
  grantSchema,
  companyPolicySchema,
  companyStanding,
  type CareerState,
  type Opportunity,
  type Grant,
} from "../shared/career";
import {
  applicationSchema,
  manifestSchema,
  type Application,
} from "../shared/model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
class Conflict extends Error {
  statusCode = 409;
}
const key = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export class CareerStore {
  constructor(
    private db: DatabaseSync,
    private dir: string,
  ) {
    const migrated = db
      .prepare("SELECT value FROM metadata WHERE key='company-key-version'")
      .get();
    if (!migrated) {
      const tx = transaction(db);
      try {
        let changed = 0;
        for (const row of db
          .prepare("SELECT id,body FROM opportunities")
          .all() as { id: string; body: string }[]) {
          const o = opportunitySchema.parse(JSON.parse(row.body));
          const normalized = companyIdentity(o.company);
          if (o.companyKey === normalized) continue;
          db.prepare("UPDATE opportunities SET body=? WHERE id=?").run(
            JSON.stringify({ ...o, companyKey: normalized }),
            row.id,
          );
          changed++;
        }
        if (changed) {
          db.exec("UPDATE career_state SET revision=revision+1 WHERE id=1");
          db.prepare(
            "INSERT INTO career_audit(at,command_id,body) VALUES (?,?,?)",
          ).run(
            new Date().toISOString(),
            "migration-company-keys-v1",
            JSON.stringify({ action: "normalize-company-keys", changed }),
          );
        }
        db.prepare(
          "INSERT OR REPLACE INTO metadata VALUES ('company-key-version','1')",
        ).run();
        tx.commit();
      } catch (error) {
        tx.rollback();
        throw error;
      }
    }
  }
  revision() {
    return (
      this.db.prepare("SELECT revision FROM career_state WHERE id=1").get() as {
        revision: number;
      }
    ).revision;
  }
  snapshot(): CareerState {
    const row = this.db
      .prepare("SELECT revision,body FROM career_state WHERE id=1")
      .get() as { revision: number; body: string };
    return {
      revision: row.revision,
      companyPolicies: [],
      ...JSON.parse(row.body),
      opportunities: (
        this.db.prepare("SELECT body FROM opportunities ORDER BY id").all() as {
          body: string;
        }[]
      ).map((r) => JSON.parse(r.body)),
      claims: this.db
        .prepare(
          "SELECT opportunity_id AS opportunityId, owner, fence, expires_at AS expiresAt, grant_id AS grantId FROM application_claims",
        )
        .all(),
    };
  }
  private get(id: string): Opportunity {
    const r = this.db
      .prepare("SELECT body FROM opportunities WHERE id=?")
      .get(id) as { body: string } | undefined;
    if (!r) throw new Conflict("Opportunity not found.");
    return opportunitySchema.parse(JSON.parse(r.body));
  }
  private put(o: Opportunity) {
    this.db
      .prepare(
        "INSERT INTO opportunities VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET job_key=excluded.job_key,body=excluded.body",
      )
      .run(
        o.id,
        o.jobKey,
        JSON.stringify({ ...o, companyKey: companyIdentity(o.company) }),
      );
  }
  /** Called inside the manifest import transaction. Existing submissions remain canonical. */
  syncConfirmed(apps: Application[]) {
    for (const a of apps) {
      const row = this.db
        .prepare(
          "SELECT body FROM opportunities WHERE json_extract(body,'$.applicationId')=? OR id=?",
        )
        .get(a.id, a.id) as { body: string } | undefined;
      const old = row
        ? opportunitySchema.parse(JSON.parse(row.body))
        : undefined;
      this.put(
        opportunitySchema.parse({
          ...old,
          id: old?.id ?? a.id,
          jobKey: old?.jobKey ?? `import:${a.id}`,
          company: a.company,
          companyKey: companyIdentity(a.company),
          title: a.title,
          location: a.location,
          url: old?.url ?? "",
          description: old?.description ?? "",
          lifecycle: "confirmed",
          applicationId: a.id,
          submittedAt: a.submitted ? `${a.submitted}T00:00:00.000Z` : null,
        }),
      );
    }
    this.db.exec("UPDATE career_state SET revision=revision+1 WHERE id=1");
  }
  command(raw: unknown) {
    const c = careerCommandSchema.parse(raw);
    const tx = transaction(this.db);
    try {
      const prior = this.db
        .prepare("SELECT request,response FROM career_commands WHERE id=?")
        .get(c.id) as { request: string; response: string } | undefined;
      if (prior) {
        if (prior.request !== JSON.stringify(c))
          throw new Conflict("Command ID reused with different arguments.");
        tx.commit();
        return JSON.parse(prior.response);
      }
      const state = this.snapshot();
      if (state.revision !== c.expectedRevision)
        throw new Conflict(
          "Career records changed. Read the current revision.",
        );
      const p = c.payload,
        now = new Date().toISOString();
      let result: unknown = null;
      const owned = (opportunityId: string, owner: string, fence: number) => {
        const claim = state.claims.find(
          (x) => x.opportunityId === opportunityId,
        );
        if (
          !claim ||
          claim.owner !== owner ||
          claim.fence !== fence ||
          claim.expiresAt <= now
        )
          throw new Conflict("Claim expired or fencing token is stale.");
        return claim;
      };
      const eligible = (o: Opportunity, g: Grant | undefined) => {
        if (!g || g.state !== "active" || g.expiresAt <= now)
          throw new Conflict(
            "Application authorization is inactive or expired.",
          );
        if (
          !o.roleFamilyId ||
          !g.roleFamilyIds.includes(o.roleFamilyId) ||
          !g.locations.some(
            (x) => x.toLowerCase() === o.location.toLowerCase(),
          ) ||
          g.exclusions.some((x) =>
            `${o.company} ${o.title}`.toLowerCase().includes(x.toLowerCase()),
          ) ||
          !o.compensation ||
          o.compensation.currency !== g.currency ||
          o.compensation.annualBase === null ||
          o.compensation.annualBase < g.minAnnualBase
        )
          throw new Conflict(
            "Role does not satisfy the authorization boundaries.",
          );
        const policy = state.companyPolicies.find(
          (x) => x.companyKey === companyIdentity(o.company),
        );
        if (policy) {
          const standing = companyStanding(
            policy,
            state.opportunities,
            now,
            o.id,
          );
          if (standing.atCap)
            throw new Conflict(
              `Company limit reached: ${standing.used} of ${standing.max} applications to ${policy.company} in ${standing.windowDays} days. ${
                standing.nextEligibleAt
                  ? `Next eligible ${standing.nextEligibleAt.slice(0, 10)}.`
                  : "Reconcile undated attempts before applying again."
              }`,
            );
        }
      };
      switch (c.action) {
        case "settings":
          state.settings = settingsSchema.parse(
            z.object({ settings: settingsSchema }).strict().parse(p).settings,
          );
          break;
        case "families": {
          const { families } = z
            .object({ families: z.array(familySchema).max(20) })
            .strict()
            .parse(p);
          if (
            new Set(families.map((f) => f.id)).size !== families.length ||
            new Set(families.map((f) => f.rank)).size !== families.length
          )
            throw new Conflict("Role family IDs and ranks must be unique.");
          if (
            state.opportunities.some(
              (o) =>
                o.roleFamilyId &&
                !families.some((f) => f.id === o.roleFamilyId),
            ) ||
            state.templates.some(
              (t) => !families.some((f) => f.id === t.familyId),
            )
          )
            throw new Conflict("Cannot remove a role family in use.");
          for (const f of families) {
            const old = state.families.find((x) => x.id === f.id);
            if (
              old &&
              old.name !== f.name &&
              (state.grants.some((g) => g.roleFamilyIds.includes(f.id)) ||
                state.templates.some((t) => t.familyId === f.id))
            )
              throw new Conflict(
                "An authorized role family cannot be renamed. Create a new family and authorization.",
              );
          }
          state.families = families;
          break;
        }
        case "opportunities": {
          const { opportunities } = z
            .object({ opportunities: z.array(opportunitySchema).max(10000) })
            .strict()
            .parse(p);
          const canonicalUrl = (value: string) => {
            const u = new URL(value);
            for (const k of [...u.searchParams.keys()])
              if (
                k.startsWith("utm_") ||
                ["source", "ref", "referrer"].includes(k)
              )
                u.searchParams.delete(k);
            u.searchParams.sort();
            u.pathname = u.pathname.replace(/\/$/, "");
            return u.toString();
          };
          const seenUrls = new Map(
            state.opportunities
              .filter((o) => o.url)
              .map((o) => [canonicalUrl(o.url), o.id]),
          );
          for (const o of opportunities) {
            if (o.url) {
              const url = canonicalUrl(o.url),
                other = seenUrls.get(url);
              if (other && other !== o.id)
                throw new Conflict(
                  "This job URL already belongs to another opportunity.",
                );
              seenUrls.set(url, o.id);
            }

            const old = state.opportunities.find((x) => x.id === o.id);
            if (
              o.roleFamilyId &&
              !state.families.some((f) => f.id === o.roleFamilyId)
            )
              throw new Conflict("Unknown role family.");
            if (o.lifecycle === "confirmed" || o.submittedAt || o.applicationId)
              throw new Conflict(
                "Submission state requires the submission or reconciliation workflow.",
              );
            if (
              ["attempted", "uncertain"].includes(o.lifecycle) &&
              !o.provenance.some(
                (e) =>
                  e.kind !== "hypothesis" && e.source.trim() && e.text.trim(),
              )
            )
              throw new Conflict(
                "Historical attempt requires source provenance.",
              );
            if (
              old &&
              (["confirmed", "attempted", "uncertain"].includes(
                old.lifecycle,
              ) ||
                state.claims.some(
                  (x) => x.opportunityId === o.id && x.expiresAt > now,
                ))
            )
              throw new Conflict(
                "Cannot overwrite submitted, uncertain, attempted or claimed records.",
              );
            if (
              old &&
              old.provenance.some(
                (e) =>
                  !o.provenance.some(
                    (n) => JSON.stringify(n) === JSON.stringify(e),
                  ),
              )
            )
              throw new Conflict("Provenance is append-only.");
            this.put(o);
          }
          break;
        }
        case "template": {
          const { template } = z
            .object({ template: templateSchema })
            .strict()
            .parse(p);
          if (template.approvedAt)
            throw new Conflict("Approve the saved template separately.");
          if (!state.families.some((f) => f.id === template.familyId))
            throw new Conflict("Unknown role family.");
          if (
            state.templates.some(
              (t) =>
                t.id === template.id ||
                (t.familyId === template.familyId &&
                  t.version === template.version),
            )
          )
            throw new Conflict(
              "Template versions are immutable. Save a new ID.",
            );
          state.templates.push(template);
          break;
        }
        case "approve-template": {
          const { id, approvalNote } = z
            .object({ id: key, approvalNote: z.string().min(1).max(2000) })
            .strict()
            .parse(p);
          const t = state.templates.find((x) => x.id === id);
          if (!t) throw new Conflict("Template not found.");
          t.approvedAt = now;
          t.approvalNote = approvalNote;
          break;
        }
        case "grant": {
          const { grant } = z.object({ grant: grantSchema }).strict().parse(p);
          if (
            state.grants.some((x) => x.id === grant.id) ||
            grant.expiresAt <= now ||
            grant.approvedAt > now ||
            grant.roleFamilyIds.some(
              (id) => !state.families.some((f) => f.id === id),
            )
          )
            throw new Conflict("Invalid, duplicate or expired authorization.");
          state.grants.push(grant);
          break;
        }
        case "grant-state": {
          const { id, status } = z
            .object({
              id: key,
              status: z.enum(["active", "paused", "revoked"]),
            })
            .strict()
            .parse(p);
          const g = state.grants.find((x) => x.id === id);
          if (!g || g.state === "revoked")
            throw new Conflict("Authorization missing or permanently revoked.");
          g.state = status;
          break;
        }
        case "claim": {
          const { opportunityId, owner, grantId, leaseSeconds } = z
            .object({
              opportunityId: key,
              owner: key,
              grantId: key,
              leaseSeconds: z.number().int().min(30).max(900).default(300),
            })
            .strict()
            .parse(p);
          const o = this.get(opportunityId);
          if (["confirmed", "uncertain", "attempted"].includes(o.lifecycle))
            throw new Conflict(
              "Reconcile the previous attempt before retrying.",
            );
          eligible(
            o,
            state.grants.find((g) => g.id === grantId),
          );
          const old = state.claims.find(
            (x) => x.opportunityId === opportunityId,
          );
          if (old && old.expiresAt > now)
            throw new Conflict("Application is already claimed.");
          const fence = (old?.fence ?? 0) + 1,
            expiresAt = new Date(
              Date.now() + leaseSeconds * 1000,
            ).toISOString();
          this.db
            .prepare(
              "INSERT INTO application_claims VALUES (?,?,?,?,?) ON CONFLICT(opportunity_id) DO UPDATE SET owner=excluded.owner,fence=excluded.fence,expires_at=excluded.expires_at,grant_id=excluded.grant_id",
            )
            .run(opportunityId, owner, fence, expiresAt, grantId);
          result = { opportunityId, owner, fence, expiresAt, grantId };
          break;
        }
        case "renew": {
          const a = z
            .object({
              opportunityId: key,
              owner: key,
              fence: z.number().int(),
              leaseSeconds: z.number().int().min(30).max(900).default(300),
            })
            .strict()
            .parse(p);
          const claim = owned(a.opportunityId, a.owner, a.fence),
            o = this.get(a.opportunityId);
          eligible(
            o,
            state.grants.find((g) => g.id === claim.grantId),
          );
          if (["attempted", "uncertain", "confirmed"].includes(o.lifecycle))
            throw new Conflict(
              "Cannot renew after a submission attempt. Reconcile its outcome.",
            );
          const expiresAt = new Date(
            Date.now() + a.leaseSeconds * 1000,
          ).toISOString();
          this.db
            .prepare(
              "UPDATE application_claims SET expires_at=? WHERE opportunity_id=?",
            )
            .run(expiresAt, a.opportunityId);
          result = { ...claim, expiresAt };
          break;
        }
        case "release": {
          const a = z
            .object({ opportunityId: key, owner: key, fence: z.number().int() })
            .strict()
            .parse(p);
          owned(a.opportunityId, a.owner, a.fence);
          this.db
            .prepare(
              "UPDATE application_claims SET expires_at=? WHERE opportunity_id=?",
            )
            .run(now, a.opportunityId);
          break;
        }
        case "prepare": {
          const a = z
            .object({
              opportunityId: key,
              owner: key,
              fence: z.number().int(),
              templateId: key,
              materialHashes: z
                .array(z.string().regex(/^[a-f0-9]{64}$/))
                .min(1),
              answers: z.string().max(20000),
            })
            .strict()
            .parse(p);
          owned(a.opportunityId, a.owner, a.fence);
          const o = this.get(a.opportunityId),
            t = state.templates.find((t) => t.id === a.templateId);
          if (
            !t?.approvedAt ||
            t.familyId !== o.roleFamilyId ||
            ["attempted", "uncertain", "confirmed"].includes(o.lifecycle)
          )
            throw new Conflict(
              "An approved matching template and unsubmitted record are required.",
            );
          for (const h of a.materialHashes) {
            let bytes;
            try {
              bytes = readFileSync(join(this.dir, "artifacts", h));
            } catch {
              throw new Conflict("Preserved material file missing.");
            }
            if (createHash("sha256").update(bytes).digest("hex") !== h)
              throw new Conflict("Material hash mismatch.");
          }
          o.templateId = t.id;
          o.materialHashes = a.materialHashes;
          o.answers = a.answers;
          o.lifecycle = "prepared";
          this.put(o);
          break;
        }
        case "begin-submit": {
          const a = z
            .object({ opportunityId: key, owner: key, fence: z.number().int() })
            .strict()
            .parse(p);
          const claim = owned(a.opportunityId, a.owner, a.fence),
            o = this.get(a.opportunityId),
            grant = state.grants.find((g) => g.id === claim.grantId);
          eligible(o, grant);
          if (o.vetting?.verdict !== "pass")
            throw new Conflict(
              "Vet the role before submitting: read the full posting and record the checks.",
            );
          if (
            o.lifecycle !== "prepared" ||
            !o.description.trim() ||
            !o.materialHashes.length ||
            !state.templates.find(
              (t) => t.id === o.templateId && t.familyId === o.roleFamilyId,
            )?.approvedAt
          )
            throw new Conflict(
              "Preserved description, materials and approved template required.",
            );
          for (const h of o.materialHashes) {
            let bytes;
            try {
              bytes = readFileSync(join(this.dir, "artifacts", h));
            } catch {
              throw new Conflict("Preserved material file missing.");
            }
            if (createHash("sha256").update(bytes).digest("hex") !== h)
              throw new Conflict("Material hash mismatch.");
          }
          const used = this.db
            .prepare(
              "SELECT COUNT(*) AS n FROM career_audit WHERE json_extract(body,'$.action')='begin-submit' AND json_extract(body,'$.grantId')=?",
            )
            .get(claim.grantId) as { n: number };
          if (used.n >= grant!.maxApplications)
            throw new Conflict("Authorization application limit reached.");
          o.lifecycle = "attempted";
          this.put(o);
          result = { authorized: true, grantId: claim.grantId };
          break;
        }
        case "result": {
          const a = z
            .object({
              opportunityId: key,
              owner: key,
              fence: z.number().int(),
              outcome: z.enum(["blocked", "uncertain"]),
              detail: z.string().min(1).max(2000),
            })
            .strict()
            .parse(p);
          owned(a.opportunityId, a.owner, a.fence);
          const o = this.get(a.opportunityId);
          if (o.lifecycle !== "attempted")
            throw new Conflict("No submission attempt to record.");
          o.lifecycle = a.outcome;
          o.provenance.push({
            id: c.id,
            kind: "source",
            text: a.detail,
            source: a.owner,
            recordedAt: now,
          });
          this.put(o);
          this.db
            .prepare(
              "UPDATE application_claims SET expires_at=? WHERE opportunity_id=?",
            )
            .run(now, o.id);
          break;
        }
        case "annotate": {
          const { opportunityId, roleFamilyId, provenance, offer } = z
            .object({
              opportunityId: key,
              roleFamilyId: key.nullable().optional(),
              provenance: opportunitySchema.shape.provenance,
              offer: opportunitySchema.shape.offer.optional(),
            })
            .strict()
            .parse(p);
          const o = this.get(opportunityId);
          if (
            roleFamilyId &&
            !state.families.some((f) => f.id === roleFamilyId)
          )
            throw new Conflict("Unknown role family.");
          if (roleFamilyId !== undefined) o.roleFamilyId = roleFamilyId;
          if (offer !== undefined) o.offer = offer;
          for (const e of provenance) {
            const old = o.provenance.find((x) => x.id === e.id);
            if (old && JSON.stringify(old) !== JSON.stringify(e))
              throw new Conflict("Provenance is append-only.");
            if (!old) o.provenance.push(e);
          }
          this.put(o);
          break;
        }
        case "triage": {
          const { opportunityId, triage } = z
            .object({
              opportunityId: key,
              triage: triageSchema
                .omit({ decision: true, decidedBy: true })
                .strict(),
            })
            .strict()
            .parse(p);
          const o = this.get(opportunityId);
          if (o.lifecycle === "confirmed")
            throw new Conflict("A confirmed application is not triaged.");
          // An agent sorts; a user decision (hold, skip, release) survives it.
          const userDecided = o.triage?.decidedBy === "user";
          o.triage = {
            ...triage,
            decidedBy: userDecided ? "user" : "agent",
            decidedAt: userDecided ? o.triage!.decidedAt : triage.decidedAt,
            decision: userDecided
              ? o.triage!.decision
              : triage.tier === "skip"
                ? "skipped"
                : "approved",
          };
          this.put(o);
          break;
        }
        case "company-policy": {
          const a = z
            .union([
              z.object({ policy: companyPolicySchema }).strict(),
              z.object({ companyKey: key, remove: z.literal(true) }).strict(),
            ])
            .parse(p);
          if ("remove" in a) {
            const n = state.companyPolicies.length;
            state.companyPolicies = state.companyPolicies.filter(
              (x) => x.companyKey !== a.companyKey,
            );
            if (state.companyPolicies.length === n)
              throw new Conflict("No policy recorded for that company.");
            break;
          }
          const policy = {
            ...a.policy,
            companyKey: companyIdentity(a.policy.company),
          };
          state.companyPolicies = [
            ...state.companyPolicies.filter(
              (x) => x.companyKey !== policy.companyKey,
            ),
            policy,
          ].sort((x, y) => x.company.localeCompare(y.company));
          result = companyStanding(policy, state.opportunities, now);
          break;
        }
        case "vet": {
          const { opportunityId, vetting } = z
            .object({ opportunityId: key, vetting: vettingSchema })
            .strict()
            .parse(p);
          const o = this.get(opportunityId);
          if (o.lifecycle === "confirmed")
            throw new Conflict("A confirmed application is not vetted again.");
          o.vetting = vetting;
          this.put(o);
          break;
        }
        case "decide": {
          const { opportunityId, decision, note } = z
            .object({
              opportunityId: key,
              decision: z.enum(["approved", "hold", "skipped"]),
              note: z.string().max(4000).default(""),
            })
            .strict()
            .parse(p);
          const o = this.get(opportunityId);
          if (!o.triage) throw new Conflict("This role has not been triaged.");
          o.triage = {
            ...o.triage,
            decision,
            decidedBy: "user",
            decidedAt: now,
          };
          o.provenance.push({
            id: `${o.id}-decision-${now.replace(/\D/g, "").slice(0, 14)}`,
            kind: "user",
            text: `${decision === "approved" ? "Released" : decision === "hold" ? "Put on hold for review" : "Skipped"} from the queue.${note ? " " + note : ""}`,
            source: "queue",
            recordedAt: now,
          });
          this.put(o);
          break;
        }
        case "confirm": {
          const { opportunityId, application } = z
            .object({ opportunityId: key, application: applicationSchema })
            .strict()
            .parse(p);
          const o = this.get(opportunityId);
          if (o.lifecycle === "confirmed")
            throw new Conflict("Application already confirmed.");
          if (
            application.company.toLowerCase().trim() !==
              o.company.toLowerCase().trim() ||
            application.title !== o.title
          )
            throw new Conflict(
              "Confirmation identity does not match the opportunity.",
            );
          const receipts = new Set(
            application.evidence
              .filter((e) => e.kind === "receipt" && e.text.trim())
              .map((e) => e.id),
          );
          if (
            !application.events.some(
              (e) =>
                e.kind === "submission" &&
                e.stage === "applied" &&
                e.evidenceIds.some((id) => receipts.has(id)),
            )
          )
            throw new Conflict("Confirmation receipt required.");
          manifestSchema.parse({
            version: 1,
            label: "Confirmed application",
            mode: "private",
            coverage: "Confirmed through career command",
            applications: [application],
          });
          if (application.evidence.some((e) => e.file))
            throw new Conflict(
              "Import evidence artifacts before confirmation; use managed hashes.",
            );
          if (
            this.db
              .prepare("SELECT id FROM applications WHERE id=?")
              .get(application.id)
          )
            throw new Conflict(
              "Application ID already exists; reconcile the existing record.",
            );
          this.db
            .prepare("INSERT INTO applications VALUES (?,?)")
            .run(
              application.id,
              JSON.stringify({ ...application, events: [], evidence: [] }),
            );
          for (const e of application.events)
            this.db
              .prepare("INSERT INTO events VALUES (?,?,?)")
              .run(e.id, application.id, JSON.stringify(e));
          for (const e of application.evidence) {
            let artifact: string | null = null;
            if (e.sha256) {
              const bytes = readFileSync(join(this.dir, "artifacts", e.sha256));
              if (createHash("sha256").update(bytes).digest("hex") !== e.sha256)
                throw new Conflict("Evidence integrity check failed.");
              artifact = e.sha256;
            }
            this.db
              .prepare("INSERT INTO evidence VALUES (?,?,?,?)")
              .run(e.id, application.id, JSON.stringify(e), artifact);
          }
          o.lifecycle = "confirmed";
          o.applicationId = application.id;
          o.submittedAt = application.submitted
            ? `${application.submitted}T00:00:00.000Z`
            : null;
          this.put(o);
          this.db
            .prepare(
              "UPDATE application_claims SET expires_at=? WHERE opportunity_id=?",
            )
            .run(now, o.id);
          this.db
            .prepare(
              "INSERT INTO metadata VALUES ('generation','1') ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1",
            )
            .run();
          break;
        }
        case "reconcile": {
          const a = z
            .object({
              opportunityId: key,
              notSubmitted: z.literal(true),
              evidence: z.string().min(1).max(2000),
              source: z.string().min(1).max(2000),
            })
            .strict()
            .parse(p);
          const o = this.get(a.opportunityId);
          if (!["uncertain", "attempted"].includes(o.lifecycle))
            throw new Conflict(
              "Only uncertain or interrupted attempts need this reconciliation.",
            );
          o.lifecycle = "blocked";
          o.provenance.push({
            id: c.id,
            kind: "source",
            text: a.evidence,
            source: a.source,
            recordedAt: now,
          });
          this.put(o);
          this.db
            .prepare(
              "UPDATE application_claims SET expires_at=? WHERE opportunity_id=?",
            )
            .run(now, o.id);
          break;
        }
      }
      const body = {
        settings: state.settings,
        families: state.families,
        templates: state.templates,
        grants: state.grants,
        companyPolicies: state.companyPolicies,
      };
      this.db
        .prepare(
          "UPDATE career_state SET revision=revision+1,body=? WHERE id=1",
        )
        .run(JSON.stringify(body));
      this.db
        .prepare("INSERT INTO career_audit(at,command_id,body) VALUES (?,?,?)")
        .run(
          now,
          c.id,
          JSON.stringify({
            ...c,
            ...(c.action === "begin-submit" ? (result as object) : {}),
          }),
        );
      const response = { revision: state.revision + 1, result };
      this.db
        .prepare("INSERT INTO career_commands VALUES (?,?,?)")
        .run(c.id, JSON.stringify(c), JSON.stringify(response));
      tx.commit();
      return response;
    } catch (e) {
      tx.rollback();
      throw e;
    }
  }
}
export function migrateCareer(db: DatabaseSync) {
  db.exec(
    `BEGIN IMMEDIATE; CREATE TABLE IF NOT EXISTS career_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS opportunities(id TEXT PRIMARY KEY,job_key TEXT UNIQUE NOT NULL,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS application_claims(opportunity_id TEXT PRIMARY KEY REFERENCES opportunities(id),owner TEXT NOT NULL,fence INTEGER NOT NULL,expires_at TEXT NOT NULL,grant_id TEXT NOT NULL); CREATE TABLE IF NOT EXISTS career_commands(id TEXT PRIMARY KEY,request TEXT NOT NULL,response TEXT NOT NULL); CREATE TABLE IF NOT EXISTS career_audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,command_id TEXT NOT NULL,body TEXT NOT NULL); PRAGMA user_version=3; COMMIT;`,
  );
  db.prepare("INSERT OR IGNORE INTO career_state VALUES (1,0,?)").run(
    JSON.stringify({
      settings: settingsSchema.parse({}),
      families: [],
      templates: [],
      grants: [],
      companyPolicies: [],
    }),
  );
}
/** Version 4. Triage once used review/auto with a pending decision; every
    non-skip role is now approved unless the user holds it, and the strong
    tier is `top`. */
export function migrateTriage(db: DatabaseSync) {
  db.exec(
    `BEGIN IMMEDIATE; ${NORMALIZE_TRIAGE} PRAGMA user_version=4; COMMIT;`,
  );
}
/** Idempotent; also run on every open, so a process still writing the old
    shape cannot leave a row the panel and the schema reject. */
export const NORMALIZE_TRIAGE = `UPDATE opportunities SET body=json_set(body,'$.triage.tier',CASE json_extract(body,'$.triage.tier') WHEN 'review' THEN 'top' WHEN 'auto' THEN 'standard' ELSE json_extract(body,'$.triage.tier') END,'$.triage.decision',CASE json_extract(body,'$.triage.decision') WHEN 'pending' THEN 'approved' ELSE json_extract(body,'$.triage.decision') END) WHERE json_extract(body,'$.triage.tier') IN ('review','auto') OR json_extract(body,'$.triage.decision')='pending';`;
