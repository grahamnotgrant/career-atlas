import { z } from "zod";
import { applicationSchema, eventSchema, type Application } from "./model";
import { applicationScene } from "./locations";
const sourceSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  date: z.string(),
  subject: z.string(),
  from: z.string(),
  text: z.string().max(100000),
  source_url: z.url(),
});
const proofSchema = z.object({
  sourceId: z.string(),
  quote: z.string().min(12),
});
const reviewedEventSchema = eventSchema.omit({ evidenceIds: true }).extend({
  proof: z.array(proofSchema).min(1),
  supersedes: z.array(z.string()).default([]),
});
export const reviewedStagesSchema = z.array(
  z.object({
    applicationId: z.string(),
    company: z.string(),
    title: z.string(),
    identityBasis: z.string().min(20),
    createIfMissing: z.boolean().default(false),
    location: z.string().default(""),
    events: z.array(reviewedEventSchema).min(1),
    status: z.enum(["rejected", "closed", "interview"]).optional(),
  }),
);
const plain = (text: string) => text.replace(/\s+/g, " ").trim();
/** Apply explicitly reviewed source-to-role joins. Never infer stages from keywords. */
export function applyReviewedStages(
  current: Application[],
  input: unknown,
  rawSources: unknown,
): Application[] {
  const updates = reviewedStagesSchema.parse(input),
    sources = z.array(sourceSchema).parse(rawSources),
    bySource = new Map(sources.map((s) => [s.id, s]));
  const apps = structuredClone(current);
  for (const update of updates) {
    let app = apps.find((a) => a.id === update.applicationId);
    if (app && (app.company !== update.company || app.title !== update.title))
      throw new Error(`Identity mismatch: ${update.applicationId}`);
    if (!app) {
      if (!update.createIfMissing)
        throw new Error(`Application missing: ${update.applicationId}`);
      if (
        !update.events.some(
          (e) => e.kind === "submission" && e.stage === "applied",
        )
      )
        throw new Error(
          "New application requires an evidenced acknowledgment event.",
        );
      const dates = update.events
        .flatMap((e) => (e.date ? [e.date] : []))
        .sort();
      app = applicationSchema.parse({
        id: update.applicationId,
        company: update.company,
        title: update.title,
        location: update.location,
        theme: applicationScene({
          location: update.location,
          theme: "neutral",
        }),
        compensation: "",
        status: "pending",
        submitted: null,
        asOf: dates.at(-1) || new Date().toISOString().slice(0, 10),
        verification: update.identityBasis,
        events: [
          {
            id: `${update.applicationId}-placeholder`,
            stage: "applied",
            date: null,
            kind: "submission",
            label: "Temporary validation event",
            detail: "",
            evidenceIds: [],
          },
        ],
        evidence: [],
      });
      app.events = [];
      apps.push(app);
    }
    for (const event of update.events) {
      const evidenceIds: string[] = [];
      for (const proof of event.proof) {
        const source = bySource.get(proof.sourceId);
        if (!source) throw new Error(`Missing stage source: ${proof.sourceId}`);
        if (
          !plain(`${source.subject}\n${source.text}`).includes(
            plain(proof.quote),
          )
        )
          throw new Error(`Proof quote missing from ${source.id}`);
        const id = `stage-mail-${source.id}`;
        evidenceIds.push(id);
        if (!app.evidence.some((e) => e.id === id))
          app.evidence.push({
            id,
            label: source.subject.slice(0, 200),
            kind: event.kind === "decision" ? "feedback" : "note",
            text: source.text,
            basis:
              `Reviewed source: ${source.source_url}. ${update.identityBasis}`.slice(
                0,
                500,
              ),
          });
      }
      if (
        event.kind === "interview" &&
        event.date &&
        !event.proof.some(
          (p) =>
            Date.parse(bySource.get(p.sourceId)!.date) >=
            Date.parse(event.date!),
        )
      )
        throw new Error(
          "Completed interview requires a source observed on or after completion.",
        );
      const { proof, supersedes, ...saved } = event;
      // Explicit reviewed duplicate IDs only: dates alone do not establish that
      // two decisions or interviews represent the same event.
      const replaced = app.events.filter(
        (e) => e.id === event.id || supersedes.includes(e.id),
      );
      for (const prior of replaced) {
        if (
          supersedes.includes(prior.id) &&
          (prior.kind !== event.kind || prior.date !== event.date)
        )
          throw new Error("Superseded event must have the same kind and date.");
        evidenceIds.push(...prior.evidenceIds);
      }
      app.events = app.events.filter((e) => !supersedes.includes(e.id));
      const combinedEvidence = [...new Set(evidenceIds)];
      const existing = app.events.findIndex((e) => e.id === event.id);
      if (existing >= 0)
        app.events[existing] = { ...saved, evidenceIds: combinedEvidence };
      else app.events.push({ ...saved, evidenceIds: combinedEvidence });
    }
    // Sorting is stable; unknown dates stay before dated events, not today's date.
    app.events.sort(
      (a, b) =>
        (a.date || "").localeCompare(b.date || "") || a.id.localeCompare(b.id),
    );
    if (update.status) {
      if (
        (update.status === "rejected" || update.status === "closed") &&
        !update.events.some((e) => e.kind === "decision")
      )
        throw new Error(
          "Outcome correction requires a source-linked decision event.",
        );
      if (
        update.status === "interview" &&
        !["rejected", "closed", "offer"].includes(app.status)
      )
        app.status = "interview";
      else if (update.status !== "interview") app.status = update.status;
    }
    app.asOf = [
      app.asOf,
      ...update.events.flatMap((e) => (e.date ? [e.date] : [])),
    ]
      .sort()
      .at(-1)!;
    applicationSchema.parse(app);
  }
  return apps;
}
