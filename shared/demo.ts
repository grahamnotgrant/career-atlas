import type { Manifest, Application, Stage, Status, Theme } from "./model";
export function demoManifest(): Manifest {
  const companies = [
    "Northstar",
    "Aster Labs",
    "Harbor AI",
    "Juniper Works",
    "Orbit Systems",
    "Fieldnote",
    "Aperture",
    "Meridian",
    "Common Ground",
    "Lumen",
    "Daybreak",
    "Atlas Works",
    "Signal Foundry",
    "Cedar",
  ];
  const apps: Application[] = companies.map((company, i) => {
    const id = `demo-${i}`,
      status: Status = i < 3 ? "rejected" : i < 6 ? "interview" : "pending";
    const stages: Stage[] =
      i === 0
        ? ["applied", "recruiter", "hiring", "case"]
        : i < 2
          ? ["applied", "recruiter", "hiring"]
          : i < 6 && i !== 2
            ? ["applied", "recruiter"]
            : ["applied"];
    const evidenceId = `${id}-source`;
    return {
      id,
      company,
      title: i % 2 ? "AI Implementation Engineer" : "Forward Deployed Engineer",
      location:
        i % 3 === 0
          ? "New York, hybrid"
          : i % 3 === 1
            ? "Chicago, on-site"
            : "Remote, US",
      theme: (["nyc", "chicago", "remote"] as Theme[])[i % 3],
      compensation: "Synthetic example: $160,000–$200,000 base",
      status,
      submitted: "2026-09-01",
      asOf: "2026-09-17",
      verification: "Synthetic example. No real application.",
      events: stages.map((stage, j) => ({
        id: `${id}-event-${j}`,
        stage,
        date: `2026-09-${String(1 + j * 3).padStart(2, "0")}`,
        label:
          stage === "applied"
            ? "Application submitted"
            : stage === "recruiter"
              ? "Recruiter invitation"
              : stage === "hiring"
                ? "Hiring manager interview"
                : "Case discussion",
        detail: "Synthetic event for exploring the interface.",
        evidenceIds: [evidenceId],
        kind: stage === "applied" ? "submission" : "interview",
      })),
      evidence: [
        {
          id: evidenceId,
          label: "Demo source note",
          kind: "note",
          text: "This record is fictional and belongs to the public demonstration dataset.",
          basis: "Synthetic fixture",
        },
      ],
    };
  });
  return {
    version: 1,
    label: "A career in motion",
    mode: "demo",
    coverage:
      "14 fictional applications for exploring the visual. No real career records.",
    applications: apps,
  };
}
