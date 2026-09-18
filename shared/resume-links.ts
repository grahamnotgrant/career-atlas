import type { Application } from "./model";

/* Linking a saved resume to an application after the fact. Each proposed
   link states how it was found, so the interface can show a hash-verified
   file differently from a filename match. Nothing here writes; `apply`
   happens only from a reviewed plan. */
export const resumeLinkTiers = {
  hash: "Resume recorded in receipt, hash verified",
  named: "Resume named in the record; bytes not verified",
  variant: "Resume variant named in the record; file supplied by you",
  company: "Resume matched by company name; confirmed by you",
} as const;
export type ResumeLinkTier = keyof typeof resumeLinkTiers;
export interface ResumeFile {
  path: string;
  name: string;
  sha256: string;
}
export interface ResumeLink {
  applicationId: string;
  company: string;
  title: string;
  tier: ResumeLinkTier;
  file: string;
  sha256: string;
  basis: string;
  /** Set on proposals that need a human decision before `apply` accepts them. */
  review?: "confirm" | "choose";
  options?: string[];
}
export function hasLinkedResume(a: Application) {
  return a.evidence.some((e) => e.kind === "resume" && e.file);
}
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const distinct = (files: ResumeFile[]) => [
  ...new Map(files.map((f) => [f.sha256, f])).values(),
];
/** Propose a link for every application without one, from the given files.
    Order of evidence: a hash the record itself states, then a filename the
    record names, then a single file carrying the company's name. */
export function proposeResumeLinks(
  applications: Application[],
  files: ResumeFile[],
): ResumeLink[] {
  const byName = new Map<string, ResumeFile[]>();
  for (const f of files) {
    const key = f.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), f]);
  }
  const links: ResumeLink[] = [];
  for (const a of applications) {
    if (hasLinkedResume(a)) continue;
    const text = a.evidence
      .map((e) => `${e.label}\n${e.text}\n${e.basis}`)
      .join("\n");
    const base = { applicationId: a.id, company: a.company, title: a.title };
    // 1. A hash, or hash prefix, written into the record.
    const prefixes = [
      ...text.matchAll(
        /sha[- ]?256[^a-f0-9]{0,12}([a-f0-9]{8,64})|\bsha\s*([a-f0-9]{8,64})/gi,
      ),
    ].map((m) => (m[1] ?? m[2]).toLowerCase());
    const byHash = distinct(
      files.filter((f) => prefixes.some((p) => f.sha256.startsWith(p))),
    );
    if (byHash.length === 1) {
      links.push({
        ...base,
        tier: "hash",
        file: byHash[0].path,
        sha256: byHash[0].sha256,
        basis: `Record states hash ${prefixes.find((p) => byHash[0].sha256.startsWith(p))}; file bytes match.`,
      });
      continue;
    }
    // 2. A filename written into the record.
    // Names may contain spaces, but prose before them is not part of the name,
    // so try both the space-tolerant match and its last whitespace-free token.
    const names = [...text.matchAll(/([\w\-. ()&]+\.pdf)\b/gi)].flatMap((m) => {
      const loose = m[1].trim().replace(/^.*\//, "").toLowerCase();
      return [loose, loose.split(/\s+/).at(-1)!];
    });
    const named = distinct(names.flatMap((n) => byName.get(n) ?? []));
    if (named.length === 1) {
      links.push({
        ...base,
        tier: "named",
        file: named[0].path,
        sha256: named[0].sha256,
        basis: `Record names ${named[0].name}; no hash recorded.`,
      });
      continue;
    }
    if (named.length > 1) {
      links.push({
        ...base,
        tier: "named",
        file: "",
        sha256: "",
        basis:
          "Record names a file that exists with different contents in more than one place.",
        review: "choose",
        options: named.map((f) => f.path),
      });
      continue;
    }
    // 3. A single file carrying the company's name.
    const word = normalize(a.company).split(" ")[0];
    if (word.length < 3) continue;
    const byCompany = distinct(
      files.filter((f) => normalize(f.name).split(" ").includes(word)),
    );
    if (byCompany.length === 1)
      links.push({
        ...base,
        tier: "company",
        file: byCompany[0].path,
        sha256: byCompany[0].sha256,
        basis: `Only ${byCompany[0].name} carries the company name; nothing in the record names it.`,
        review: "confirm",
      });
    else if (byCompany.length > 1)
      links.push({
        ...base,
        tier: "company",
        file: "",
        sha256: "",
        basis: "Several files carry the company name.",
        review: "choose",
        options: byCompany.map((f) => f.path),
      });
  }
  return links;
}
