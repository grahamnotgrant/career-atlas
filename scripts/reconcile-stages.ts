import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { manifestSchema } from "../shared/model";
import { applyReviewedStages } from "../shared/stage-history";
const [base, reviewed, sources, out] = process.argv.slice(2);
if (!base || !reviewed || !sources || !out)
  throw new Error(
    "Usage: tsx scripts/reconcile-stages.ts base-manifest.json reviewed-stages.json stage-messages.json output-manifest.json. No live database writes.",
  );
const reviewedInput = JSON.parse(readFileSync(resolve(reviewed), "utf8"));
const manifest = manifestSchema.parse(
  JSON.parse(readFileSync(resolve(base), "utf8")),
);
manifest.applications = applyReviewedStages(
  manifest.applications,
  reviewedInput,
  JSON.parse(readFileSync(resolve(sources), "utf8")),
);
manifest.coverage +=
  " Historical stage events restored from reviewed employer correspondence; invitations and completed interviews remain distinct.";
manifestSchema.parse(manifest);
const affected = new Set(
  reviewedInput.map((u: { applicationId: string }) => u.applicationId),
);
const patch = {
  ...manifest,
  applications: manifest.applications.filter((a) => affected.has(a.id)),
};
writeFileSync(resolve(out), JSON.stringify(patch, null, 2), { mode: 0o600 });
console.log(
  JSON.stringify(
    {
      applications: manifest.applications.length,
      patchedApplications: patch.applications.length,
      stages: Object.fromEntries(
        ["recruiter", "hiring", "case", "offer"].map((stage) => [
          stage,
          {
            reached: manifest.applications.filter((a) =>
              a.events.some(
                (e) =>
                  e.stage === stage &&
                  (e.kind === "invitation" || e.kind === "interview"),
              ),
            ).length,
            completed: manifest.applications.filter((a) =>
              a.events.some((e) => e.stage === stage && e.kind === "interview"),
            ).length,
          },
        ]),
      ),
    },
    null,
    2,
  ),
);
