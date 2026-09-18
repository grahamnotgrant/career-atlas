import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { Store } from "../server/store";
import { dataDirectory } from "../server/paths";
import {
  proposeResumeLinks,
  resumeLinkTiers,
  type ResumeFile,
  type ResumeLink,
} from "../shared/resume-links";

const usage = `Usage:
  npm run resumes -- propose <folder>... --out /private/plan.json
  npm run resumes -- apply /private/plan.json [--replace]

propose scans the folders for PDFs, matches each application without a
linked resume by hash, filename or company name, and writes a plan to
review. Entries marked "review" need a decision: set "file" from "options"
and remove "review", or delete the entry. apply skips entries still marked
for review and attaches every other entry that has a file.`;

function collect(folder: string, depth = 0, out: ResumeFile[] = []) {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (depth < 4) collect(path, depth + 1, out);
    } else if (/\.pdf$/i.test(name))
      out.push({
        path,
        name,
        sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      });
  }
  return out;
}

const [action, ...rest] = process.argv.slice(2);
if (action === "propose") {
  const outIndex = rest.indexOf("--out");
  if (outIndex < 0 || !rest[outIndex + 1] || rest.length < 3)
    throw new Error(usage);
  const out = resolve(rest[outIndex + 1]);
  const folders = rest.filter((_, i) => i !== outIndex && i !== outIndex + 1);
  const files = folders.flatMap((f) => collect(resolve(f)));
  const store = new Store(dataDirectory());
  try {
    const applications = store.snapshot().applications;
    const links = proposeResumeLinks(applications, files);
    writeFileSync(out, JSON.stringify(links, null, 2), { mode: 0o600 });
    const unlinked = applications.filter(
      (a) => !a.evidence.some((e) => e.kind === "resume" && e.file),
    ).length;
    const counts = Object.fromEntries(
      Object.keys(resumeLinkTiers).map((tier) => [
        tier,
        links.filter((l) => l.tier === tier && !l.review).length,
      ]),
    );
    console.log(
      JSON.stringify(
        {
          files: files.length,
          unlinked,
          proposed: links.filter((l) => !l.review).length,
          needReview: links.filter((l) => l.review).length,
          byTier: counts,
          plan: out,
        },
        null,
        2,
      ),
    );
  } finally {
    store.close();
  }
} else if (action === "apply") {
  const path = rest[0];
  if (!path) throw new Error(usage);
  const replace = rest.includes("--replace");
  const links = JSON.parse(readFileSync(resolve(path), "utf8")) as ResumeLink[];
  const store = new Store(dataDirectory());
  const result = {
    attached: 0,
    skipped: [] as string[],
    failed: [] as string[],
  };
  try {
    for (const link of links) {
      if (link.review) {
        result.skipped.push(`${link.company}: still marked for review`);
        continue;
      }
      if (!link.file || !(link.tier in resumeLinkTiers)) {
        result.skipped.push(`${link.company}: no file chosen`);
        continue;
      }
      try {
        store.attachResume(link.applicationId, {
          path: link.file,
          label: resumeLinkTiers[link.tier],
          basis: link.basis,
          replace,
        });
        result.attached++;
      } catch (error) {
        result.failed.push(
          `${link.company}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } finally {
    store.close();
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.failed.length) process.exitCode = 1;
} else throw new Error(usage);
