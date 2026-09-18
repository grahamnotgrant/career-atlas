import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { Application } from "../shared/model";
import { proposeResumeLinks, type ResumeFile } from "../shared/resume-links";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const file = (name: string, content = name): ResumeFile => ({
  path: `/resumes/${name}`,
  name,
  sha256: sha(content),
});
let n = 0;
function app(
  company: string,
  evidenceText: string,
  linked = false,
): Application {
  const id = `a${++n}`;
  return {
    id,
    company,
    title: "Engineer",
    location: "Remote",
    theme: "neutral",
    compensation: "",
    status: "pending",
    submitted: "2026-09-01",
    asOf: "2026-09-17",
    verification: "",
    events: [
      {
        id: `${id}-e`,
        kind: "submission",
        stage: "applied",
        date: "2026-09-01",
        label: "Application submitted",
        detail: "",
        evidenceIds: [`${id}-r`],
      },
    ],
    evidence: [
      {
        id: `${id}-r`,
        kind: "receipt",
        label: "Receipt",
        text: evidenceText,
        basis: "",
      },
      ...(linked
        ? [
            {
              id: `${id}-resume`,
              kind: "resume" as const,
              label: "Resume",
              text: "",
              basis: "",
              file: "/api/evidence/x/file",
              sha256: sha("x"),
            },
          ]
        : []),
    ],
  };
}
const files = [
  file("101-acme-engineer.pdf"),
  file("102-globex-engineer.pdf"),
  file("103-initech-engineer.pdf"),
  file("103-initech-engineer.pdf", "a different render"),
  file("104-umbrella-engineer.pdf"),
  file("105-umbrella-sales.pdf"),
];

it("prefers a hash the record states over a filename, and skips linked applications", () => {
  const acme = app(
    "Acme",
    `Resume 999 (sha ${sha("101-acme-engineer.pdf").slice(0, 10)}…)`,
  );
  const already = app("Acme", "Resume: 101-acme-engineer.pdf", true);
  const links = proposeResumeLinks([acme, already], files);
  expect(links).toHaveLength(1);
  expect(links[0]).toMatchObject({
    applicationId: acme.id,
    tier: "hash",
    file: "/resumes/101-acme-engineer.pdf",
  });
});
it("links a named file when it exists once, and asks when the same name has different contents", () => {
  const globex = app("Globex", "Uploaded 102-globex-engineer.pdf at 10:02.");
  const initech = app("Initech", "Resume: 103-initech-engineer.pdf");
  const [g, i] = proposeResumeLinks([globex, initech], files);
  expect(g).toMatchObject({
    tier: "named",
    file: "/resumes/102-globex-engineer.pdf",
  });
  expect(i).toMatchObject({ tier: "named", review: "choose" });
  expect(i.options).toHaveLength(2);
});
it("falls back to a company-name match that needs confirmation, and stays silent otherwise", () => {
  const umbrella = app("Umbrella Corp", "Thank you for applying.");
  const acme = app("Acme", "Thank you for applying.");
  const nobody = app("Wayne", "Thank you for applying.");
  const links = proposeResumeLinks([umbrella, acme, nobody], files);
  expect(links.find((l) => l.applicationId === umbrella.id)).toMatchObject({
    tier: "company",
    review: "choose",
  });
  expect(links.find((l) => l.applicationId === acme.id)).toMatchObject({
    tier: "company",
    review: "confirm",
    file: "/resumes/101-acme-engineer.pdf",
  });
  expect(links.find((l) => l.applicationId === nobody.id)).toBeUndefined();
});
