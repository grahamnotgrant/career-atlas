import { z } from "zod";
import { companyIdentity } from "./career";

/** Public job-board JSON endpoints. No account, key or connector is needed. */
export const atsSchema = z.enum(["ashby", "greenhouse", "lever"]);
export type Ats = z.infer<typeof atsSchema>;
export const boardSchema = z.object({
  ats: atsSchema,
  slug: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
  company: z.string().max(200).default(""),
  addedAt: z.iso.datetime().nullable().default(null),
  source: z.string().max(500).default(""),
});
export type Board = z.infer<typeof boardSchema>;
export const boardListSchema = z.object({
  version: z.literal(1),
  boards: z.array(boardSchema).max(5000),
});
export const checkpointSchema = z.object({
  version: z.literal(1),
  polledAt: z.iso.datetime(),
  since: z.iso.datetime(),
  boards: z.number().int(),
  failed: z.array(z.string()),
});

export function boardUrl(b: Board) {
  return {
    ashby: `https://api.ashbyhq.com/posting-api/job-board/${b.slug}?includeCompensation=true`,
    greenhouse: `https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs?content=true`,
    lever: `https://api.lever.co/v0/postings/${b.slug}?mode=json`,
  }[b.ats];
}

/** Recognize an ATS board from a job URL already stored or found anywhere. */
export function boardFromUrl(url: string): Board | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const seg = u.pathname.split("/").filter(Boolean)[0] ?? "";
  const ok = /^[A-Za-z0-9._-]{1,100}$/.test(seg);
  if (!ok) return null;
  if (u.hostname === "jobs.ashbyhq.com")
    return { ats: "ashby", slug: seg, company: "", addedAt: null, source: url };
  if (/^(boards|job-boards)\.greenhouse\.io$/.test(u.hostname))
    return {
      ats: "greenhouse",
      slug: seg,
      company: "",
      addedAt: null,
      source: url,
    };
  if (u.hostname === "jobs.lever.co")
    return { ats: "lever", slug: seg, company: "", addedAt: null, source: url };
  return null;
}

export interface Posting {
  ats: Ats;
  slug: string;
  company: string;
  title: string;
  url: string;
  location: string;
  workArrangement: "remote" | "hybrid" | "onsite" | "unknown";
  publishedAt: string | null;
  compensation: { currency: string; min: number | null; max: number | null };
  compensationSummary: string;
  description: string;
}

const clip = (s: unknown, n = 100000) =>
  typeof s === "string" ? s.slice(0, n) : "";
const htmlToText = (html: string) =>
  html
    .replace(/<(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const arrangement = (
  remote: boolean | null,
  workplace: string,
  location: string,
): Posting["workArrangement"] => {
  const w = `${workplace} ${location}`.toLowerCase();
  if (remote || /remote/.test(w)) return /hybrid/.test(w) ? "hybrid" : "remote";
  if (/hybrid/.test(w)) return "hybrid";
  if (/on-?site/.test(w)) return "onsite";
  return workplace ? "onsite" : "unknown";
};

/** Normalize one board's JSON into postings; unknown shapes yield no rows. */
export function parseBoard(b: Board, body: unknown): Posting[] {
  const rows: Posting[] = [];
  const o = (body ?? {}) as Record<string, unknown>;
  if (b.ats === "ashby" && Array.isArray(o.jobs))
    for (const j of o.jobs as Record<string, unknown>[]) {
      const comp = (j.compensation ?? {}) as Record<string, unknown>;
      const tiers = (comp.summaryComponents ?? []) as Record<string, unknown>[];
      const salary = tiers.find((t) => t.compensationType === "Salary");
      const location = clip(j.location, 300);
      rows.push({
        ats: "ashby",
        slug: b.slug,
        company: b.company || clip(j.organizationName, 200) || b.slug,
        title: clip(j.title, 300),
        url: clip(j.jobUrl, 2000),
        location,
        workArrangement: arrangement(
          j.isRemote === true,
          clip(j.workplaceType, 40),
          location,
        ),
        publishedAt: clip(j.publishedAt, 40) || null,
        compensation: {
          currency: clip(salary?.currencyCode, 3) || "USD",
          min: typeof salary?.minValue === "number" ? salary.minValue : null,
          max: typeof salary?.maxValue === "number" ? salary.maxValue : null,
        },
        compensationSummary: clip(comp.compensationTierSummary, 300),
        description:
          clip(j.descriptionPlain) || htmlToText(clip(j.descriptionHtml)),
      });
    }
  else if (b.ats === "greenhouse" && Array.isArray(o.jobs))
    for (const j of o.jobs as Record<string, unknown>[]) {
      const location = clip((j.location as Record<string, unknown>)?.name, 300);
      rows.push({
        ats: "greenhouse",
        slug: b.slug,
        company: b.company || clip(j.company_name, 200) || b.slug,
        title: clip(j.title, 300),
        url: clip(j.absolute_url, 2000),
        location,
        workArrangement: arrangement(null, "", location),
        publishedAt: clip(j.first_published ?? j.updated_at, 40) || null,
        compensation: { currency: "USD", min: null, max: null },
        compensationSummary: "",
        description: htmlToText(clip(j.content)),
      });
    }
  else if (b.ats === "lever" && Array.isArray(body))
    for (const j of body as Record<string, unknown>[]) {
      const cat = (j.categories ?? {}) as Record<string, unknown>;
      const location = clip(cat.location, 300);
      const range = (j.salaryRange ?? null) as Record<string, unknown> | null;
      rows.push({
        ats: "lever",
        slug: b.slug,
        company: b.company || b.slug,
        title: clip(j.text, 300),
        url: clip(j.hostedUrl, 2000),
        location,
        workArrangement: arrangement(null, clip(j.workplaceType, 40), location),
        publishedAt:
          typeof j.createdAt === "number"
            ? new Date(j.createdAt).toISOString()
            : null,
        compensation: {
          currency: clip(range?.currency, 3) || "USD",
          min: typeof range?.min === "number" ? range.min : null,
          max: typeof range?.max === "number" ? range.max : null,
        },
        compensationSummary: range
          ? `${range.currency ?? ""} ${range.min ?? ""}–${range.max ?? ""}`.trim()
          : "",
        description:
          clip(j.descriptionPlain) || htmlToText(clip(j.description)),
      });
    }
  return rows.filter((r) => r.title && r.url);
}

export interface ScoutFilter {
  /** Case-insensitive title patterns; empty matches every title. */
  titlePatterns: RegExp[];
  /** Location words the user accepts; empty accepts every location. */
  locations: string[];
  /** Keep postings published at or after this instant; null keeps all. */
  since: string | null;
  /** Canonical URLs already stored as opportunities. */
  knownUrls: Set<string>;
}

export function canonicalJobUrl(value: string) {
  try {
    const u = new URL(value);
    for (const k of [...u.searchParams.keys()])
      if (k.startsWith("utm_") || ["source", "ref", "referrer"].includes(k))
        u.searchParams.delete(k);
    u.searchParams.sort();
    u.pathname = u.pathname.replace(/\/$/, "");
    return u.toString();
  } catch {
    return value;
  }
}

const locationWords: Record<string, RegExp> = {
  remote: /\bremote\b/i,
  "new york": /new york|\bnyc?\b|manhattan|brooklyn/i,
  "san francisco":
    /san francisco|\bsf\b|bay area|palo alto|menlo park|mountain view|south san francisco/i,
  chicago: /chicago/i,
  seattle: /seattle|bellevue|redmond/i,
  boston: /boston|cambridge, ma/i,
  "washington dc": /washington,? d\.?c\.?|\bdc\b|arlington|mclean/i,
  austin: /austin/i,
  denver: /denver|boulder/i,
  "los angeles": /los angeles|\bla\b|santa monica/i,
  "san diego": /san diego/i,
  "united states": /united states|\busa?\b|us-remote|remote \(us\)|remote, us/i,
};

/** Regions outside the user's countries; a "remote" posting scoped to one of these is not a match. */
const foreignRegion =
  /\b(apac|emea|latam|europe|eu|uk|united kingdom|england|london|ireland|dublin|germany|berlin|munich|france|paris|spain|madrid|barcelona|portugal|lisbon|netherlands|amsterdam|switzerland|zurich|sweden|stockholm|poland|warsaw|israel|tel aviv|india|bangalore|bengaluru|singapore|japan|tokyo|australia|sydney|melbourne|canada|toronto|vancouver|montreal|brazil|mexico|argentina|philippines|vietnam|china|korea|uae|dubai|abu dhabi)\b/i;
const domesticRegion =
  /united states|\busa?\b|\bu\.s\.|new york|san francisco|chicago|seattle|boston|washington|austin|denver|los angeles|san diego|\bnyc?\b|\bsf\b|bay area|, [a-z]{2}\b/i;

export function locationMatches(location: string, accepted: string[]) {
  if (!accepted.length) return true;
  if (foreignRegion.test(location) && !domesticRegion.test(location))
    return false;
  return accepted.some((a) => {
    const key = a.trim().toLowerCase();
    const re =
      locationWords[key] ??
      new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    return re.test(location);
  });
}

export function filterPostings(rows: Posting[], f: ScoutFilter) {
  const since = f.since ? Date.parse(f.since) : null;
  return rows.filter((r) => {
    if (f.titlePatterns.length && !f.titlePatterns.some((p) => p.test(r.title)))
      return false;
    const loc =
      r.workArrangement === "remote" ? `${r.location} remote` : r.location;
    if (!locationMatches(loc, f.locations)) return false;
    if (since !== null) {
      const t = r.publishedAt ? Date.parse(r.publishedAt) : NaN;
      if (Number.isNaN(t) || t < since) return false;
    }
    return !f.knownUrls.has(canonicalJobUrl(r.url));
  });
}

/** Default title patterns for the current role families; agents may narrow them. */
export const defaultTitlePatterns = [
  /forward[- ]deploy/i,
  /deployment (strategist|engineer|manager|lead)/i,
  /applied ai/i,
  /\bai\b.*(engineer|architect|solutions|implementation|enablement|workflow|automation)/i,
  /(solutions|implementation|customer|enablement) (engineer|architect)/i,
  /product engineer/i,
  /technical product manager/i,
  /member of technical staff/i,
];

const short = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** Build a discovered opportunity payload the career API accepts. */
export function toOpportunity(
  p: Posting,
  recordedAt: string,
  prefix = "scout",
) {
  const tail = p.url.split("/").filter(Boolean).pop() ?? "";
  const id = `${prefix}-${short(p.company)}-${short(tail)}`.slice(0, 100);
  return {
    id,
    company: p.company,
    companyKey: companyIdentity(p.company),
    title: p.title,
    jobKey: `${companyIdentity(p.company)}|${p.ats}:${p.slug}:${tail}`,
    url: p.url,
    description: p.description,
    location: p.location,
    workArrangement: p.workArrangement,
    compensation:
      p.compensation.min === null && p.compensation.max === null
        ? null
        : {
            currency: p.compensation.currency,
            annualBase: p.compensation.min ?? p.compensation.max,
            annualCash: null,
          },
    lifecycle: "discovered" as const,
    provenance: [
      {
        id: `${id}-source`,
        kind: "employer" as const,
        text: JSON.stringify({
          ats: p.ats,
          board: p.slug,
          publishedAt: p.publishedAt,
          compensationSummary: p.compensationSummary,
          location: p.location,
        }),
        source: p.url,
        recordedAt,
      },
    ],
  };
}
