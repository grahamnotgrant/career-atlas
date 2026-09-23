import { useMemo, useState, useRef } from "react";
import { statusLabels, type Application } from "../shared/model";
import {
  companyStanding,
  isQueued,
  type CareerState,
  type CompanyStanding,
  type Opportunity,
} from "../shared/career";
import { Popup } from "./Popup";
import { arrangementConversion, formatRate } from "./journey";

type Tab = "queue" | "roles" | "records" | "companies" | "analysis";
type Command = (
  action: string,
  payload: Record<string, unknown>,
  revision?: number,
) => Promise<boolean>;
const uid = () => crypto.randomUUID();
const tabs: { id: Tab; label: string }[] = [
  { id: "queue", label: "Queue" },
  { id: "roles", label: "Top roles" },
  { id: "records", label: "All records" },
  { id: "companies", label: "Companies" },
  { id: "analysis", label: "Outcomes" },
];
export function CareerPanel({
  career,
  applications,
  initial,
  onClose,
  onSelect,
  onRole,
  onEvidence,
  command,
}: {
  career: CareerState;
  applications: Application[];
  initial: Tab;
  onClose: () => void;
  onSelect: (id: string) => void;
  onRole: (id: string) => void;
  onEvidence: (applicationId: string, evidenceId: string) => void;
  command: Command;
}) {
  const [tab, setTab] = useState<Tab>(initial),
    [query, setQuery] = useState(""),
    [limit, setLimit] = useState(50),
    [selectedRecord, setDetail] = useState<Opportunity | null>(null),
    [error, setError] = useState(""),
    [companyLimits, setCompanyLimits] = useState<Record<string, number>>({});
  const detail =
    career.opportunities.find((o) => o.id === selectedRecord?.id) ??
    selectedRecord;
  const appIndex = useMemo(
    () => new Map(applications.map((a) => [a.id, a])),
    [applications],
  );
  /* The queue: sorted roles nobody has applied to yet. Review-tier roles
     come first, best score first; auto-tier roles follow so the user can
     still pull one out before an agent takes it. */
  const queue = useMemo(
    () =>
      career.opportunities
        .filter(isQueued)
        .sort(
          (a, b) =>
            Number(b.triage!.tier === "top") -
              Number(a.triage!.tier === "top") ||
            (b.triage!.score ?? -1) - (a.triage!.score ?? -1) ||
            a.company.localeCompare(b.company),
        ),
    [career.opportunities],
  );
  /* In flight: every unexpired claim, joined to its opportunity, with how far
     the agent has taken it. Attempts that ended without a confirmation in the
     last day, and claims that lapsed mid-way, are the ones a person must see. */
  const now = Date.now();
  /* Employer application limits: how many submissions sit inside each
     company's window right now, and when the next one is allowed. */
  const standings = useMemo(() => {
    const at = new Date(now).toISOString();
    return new Map<string, CompanyStanding & { company: string }>(
      career.companyPolicies.map((p) => [
        p.companyKey,
        { ...companyStanding(p, career.opportunities, at), company: p.company },
      ]),
    );
  }, [career.companyPolicies, career.opportunities, now]);
  const inFlight = useMemo(() => {
    const byId = new Map(career.opportunities.map((o) => [o.id, o]));
    return career.claims
      .map((claim) => ({ claim, o: byId.get(claim.opportunityId) }))
      .filter(
        (
          row,
        ): row is { claim: (typeof career.claims)[number]; o: Opportunity } =>
          !!row.o,
      )
      .map(({ claim, o }) => ({
        claim,
        o,
        live: Date.parse(claim.expiresAt) > now,
        step:
          o.lifecycle === "confirmed"
            ? 4
            : o.lifecycle === "attempted"
              ? 3
              : o.lifecycle === "prepared"
                ? 2
                : o.vetting?.verdict === "pass"
                  ? 1
                  : 0,
      }))
      .sort(
        (a, b) =>
          Number(b.live) - Number(a.live) ||
          a.claim.expiresAt.localeCompare(b.claim.expiresAt),
      );
  }, [career.claims, career.opportunities, now]);
  const needsPerson = useMemo(
    () =>
      career.opportunities.filter(
        (o) =>
          (o.lifecycle === "uncertain" || o.lifecycle === "blocked") &&
          o.provenance.some((p) => now - Date.parse(p.recordedAt) < 86_400_000),
      ),
    [career.opportunities, now],
  );
  const records = useMemo(
    () =>
      career.opportunities.filter((o) =>
        `${o.company} ${o.title} ${o.location} ${o.lifecycle}`
          .toLowerCase()
          .includes(query.toLowerCase().trim()),
      ),
    [career.opportunities, query],
  );
  const companies = useMemo(() => {
    const groups = new Map<string, Opportunity[]>();
    for (const o of records) {
      const list = groups.get(o.companyKey) ?? [];
      list.push(o);
      groups.set(o.companyKey, list);
    }
    return [...groups].sort((a, b) => b[1].length - a[1].length);
  }, [records]);
  function counts(list: Opportunity[]) {
    const confirmed = list.flatMap((o) =>
      o.applicationId && appIndex.has(o.applicationId)
        ? [appIndex.get(o.applicationId)!]
        : [],
    );
    return {
      all: list.length,
      submitted: confirmed.length,
      pending: confirmed.filter((a) => a.status === "pending").length,
      interview: confirmed.filter((a) => a.status === "interview").length,
      rejected: confirmed.filter((a) => a.status === "rejected").length,
      offer: confirmed.filter((a) => a.status === "offer").length,
    };
  }
  const roles = [...career.families].sort((a, b) => a.rank - b.rank);
  async function save(action: string, payload: Record<string, unknown>) {
    setError("");
    const ok = await command(action, payload, career.revision);
    if (!ok)
      setError(
        "Could not save. Check the error message, then reopen this panel to load the latest records.",
      );
    return ok;
  }
  return (
    <Popup title="Career Atlas" wide onClose={onClose}>
      <div className="career-panel popup-body">
        <nav className="career-tabs" aria-label="Workspace sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              aria-pressed={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setQuery("");
                setLimit(50);
                setDetail(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {error && <p role="alert">{error}</p>}
        {tab === "queue" && (
          <>
            <h2>Queue</h2>
            {(inFlight.length > 0 || needsPerson.length > 0) && (
              <section className="in-flight">
                <h3>
                  In flight ·{" "}
                  {
                    new Set(
                      inFlight.filter((r) => r.live).map((r) => r.claim.owner),
                    ).size
                  }{" "}
                  {new Set(
                    inFlight.filter((r) => r.live).map((r) => r.claim.owner),
                  ).size === 1
                    ? "agent"
                    : "agents"}{" "}
                  · {inFlight.filter((r) => r.live).length} claimed
                </h3>
                {inFlight.map(({ claim, o, live, step }) => {
                  const minutes = Math.max(
                    0,
                    Math.round((Date.parse(claim.expiresAt) - now) / 60000),
                  );
                  return (
                    <article
                      className="flight-row"
                      key={o.id}
                      data-live={live ? "true" : "false"}
                    >
                      <button
                        className="queue-open"
                        onClick={() => {
                          setTab("records");
                          setDetail(o);
                        }}
                      >
                        <strong>{o.company}</strong>
                        <span>{o.title}</span>
                        <small>
                          {claim.owner} ·{" "}
                          {live
                            ? `lease ${minutes} min`
                            : o.lifecycle === "confirmed"
                              ? "confirmed"
                              : "lease lapsed without a result"}
                        </small>
                      </button>
                      <ol
                        className="flight-steps"
                        aria-label={`Progress: step ${step + 1} of 5`}
                      >
                        {[
                          "claimed",
                          "vetted",
                          "prepared",
                          "submitting",
                          "confirmed",
                        ].map((name, i) => (
                          <li
                            key={name}
                            data-state={
                              i < step
                                ? "done"
                                : i === step
                                  ? "current"
                                  : "todo"
                            }
                          >
                            {name}
                          </li>
                        ))}
                      </ol>
                    </article>
                  );
                })}
                {needsPerson.length > 0 && (
                  <>
                    <h3>Needs a person · {needsPerson.length}</h3>
                    {needsPerson.map((o) => (
                      <article
                        className="flight-row"
                        key={o.id}
                        data-live="false"
                      >
                        <button
                          className="queue-open"
                          onClick={() => {
                            setTab("records");
                            setDetail(o);
                          }}
                        >
                          <strong>{o.company}</strong>
                          <span>{o.title}</span>
                          <small>
                            {o.lifecycle} ·{" "}
                            {o.provenance.at(-1)?.text.slice(0, 120)}
                          </small>
                        </button>
                      </article>
                    ))}
                  </>
                )}
              </section>
            )}
            {!queue.length && (
              <p>
                No sorted roles yet. An agent adds roles here with the
                <code> triage </code>
                command; agents apply to everything under your grant unless you
                put a role on hold.
              </p>
            )}
            {(["hold", "approved"] as const).map((decision) => {
              const rows = queue.filter((o) => o.triage!.decision === decision);
              if (!rows.length) return null;
              return (
                <section
                  className="queue-tier"
                  key={decision}
                  data-tier={decision}
                >
                  <h3>
                    {decision === "hold"
                      ? `On hold for your review · ${rows.length}`
                      : `Agents apply under your grant · ${rows.length} · ${rows.filter((o) => o.triage!.tier === "top").length} top`}
                  </h3>
                  {rows.slice(0, 60).map((o) => (
                    <article
                      className="queue-row"
                      key={o.id}
                      data-decision={o.triage!.decision}
                      data-tier={o.triage!.tier}
                    >
                      <button
                        className="queue-open"
                        onClick={() => {
                          setTab("records");
                          setDetail(o);
                        }}
                      >
                        <strong>
                          {o.triage!.tier === "top" && (
                            <b className="tier-top">Top</b>
                          )}
                          {o.company}
                        </strong>
                        <span>{o.title}</span>
                        <small>
                          {o.vetting && (
                            <b
                              className="vetted"
                              data-verdict={o.vetting.verdict}
                            >
                              {o.vetting.verdict === "pass"
                                ? "Vetted"
                                : "Failed vetting"}
                            </b>
                          )}
                          {standings.has(o.companyKey) && (
                            <CompanyCap
                              standing={standings.get(o.companyKey)!}
                            />
                          )}
                          {[
                            o.location,
                            o.compensation?.annualBase
                              ? `${o.compensation.currency} ${Math.round(o.compensation.annualBase / 1000)}K base`
                              : null,
                            o.triage!.score !== null
                              ? `fit ${o.triage!.score}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                        {o.triage!.reason && <p>{o.triage!.reason}</p>}
                      </button>
                      <div className="queue-actions">
                        {decision === "hold" ? (
                          <button
                            onClick={() =>
                              void save("decide", {
                                opportunityId: o.id,
                                decision: "approved",
                              })
                            }
                          >
                            Release
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              void save("decide", {
                                opportunityId: o.id,
                                decision: "hold",
                              })
                            }
                          >
                            Hold
                          </button>
                        )}
                        <button
                          className="quiet-button"
                          onClick={() =>
                            void save("decide", {
                              opportunityId: o.id,
                              decision: "skipped",
                            })
                          }
                        >
                          Skip
                        </button>
                      </div>
                    </article>
                  ))}
                  {rows.length > 60 && (
                    <p>{rows.length - 60} more in All records.</p>
                  )}
                </section>
              );
            })}
          </>
        )}
        {tab === "roles" && (
          <>
            <h2>
              {roles.length
                ? `Your top ${roles.length} roles`
                : "Your top roles"}
            </h2>
            {!roles.length && <p>No target roles yet.</p>}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Found</th>
                    <th>Applied</th>
                    <th>Awaiting</th>
                    <th>Interview</th>
                    <th>Rejected</th>
                    <th>Offer</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...roles,
                    {
                      id: "unmatched",
                      name: "Unmatched",
                      rank: 21,
                      evidence: [],
                      rationale: "",
                    },
                  ].map((f) => {
                    const list = career.opportunities.filter((o) =>
                        f.id === "unmatched"
                          ? !o.roleFamilyId
                          : o.roleFamilyId === f.id,
                      ),
                      c = counts(list);
                    return (
                      <tr key={f.id}>
                        <th>
                          <button
                            disabled={!c.submitted}
                            onClick={() => onRole(f.id)}
                          >
                            {f.name}
                          </button>
                          {f.rationale && (
                            <details>
                              <summary>Fit evidence</summary>
                              <p>{f.rationale}</p>
                              <ul>
                                {f.evidence.map((e, i) => (
                                  <li key={i}>{e}</li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </th>
                        <td>{c.all}</td>
                        <td>{c.submitted}</td>
                        <td>{c.pending}</td>
                        <td>{c.interview}</td>
                        <td>{c.rejected}</td>
                        <td>{c.offer}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {(tab === "records" || tab === "companies") && (
          <>
            <label className="career-search">
              Search records
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(50);
                }}
                placeholder="Company, role, location or state"
              />
            </label>
            <p>
              {records.length} records · {counts(records).submitted} confirmed
              submissions
            </p>
            {detail ? (
              <article className="opportunity-detail">
                <button onClick={() => setDetail(null)}>Close record</button>
                <h2>{detail.company}</h2>
                <h3>{detail.title}</h3>
                <p>
                  {detail.location} · {detail.lifecycle}
                </p>
                {detail.url && (
                  <a
                    href={
                      /^https?:\/\//.test(detail.url) ? detail.url : undefined
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Job description ↗
                  </a>
                )}
                {detail.applicationId && (
                  <button onClick={() => onSelect(detail.applicationId!)}>
                    Open application
                  </button>
                )}
                {detail.vetting && (
                  <p className="record-triage">
                    <b data-verdict={detail.vetting.verdict}>
                      {detail.vetting.verdict === "pass"
                        ? "Vetted"
                        : "Failed vetting"}
                    </b>{" "}
                    by {detail.vetting.by} on {detail.vetting.at.slice(0, 10)}:{" "}
                    {detail.vetting.checks.join(", ")}
                    {detail.vetting.note && (
                      <>
                        <br />
                        {detail.vetting.note}
                      </>
                    )}
                  </p>
                )}
                {detail.triage && (
                  <p className="record-triage">
                    Sorted as <b>{detail.triage.tier}</b>
                    {detail.triage.score !== null &&
                      ` · fit ${detail.triage.score}`}
                    {` · ${detail.triage.decision}`}
                    {detail.triage.decidedBy === "user" && " by you"}
                    {detail.triage.reason && (
                      <>
                        <br />
                        {detail.triage.reason}
                      </>
                    )}
                  </p>
                )}
                <label>
                  Role family
                  <select
                    value={detail.roleFamilyId ?? ""}
                    onChange={async (e) => {
                      const next = {
                        ...detail,
                        roleFamilyId: e.target.value || null,
                      };
                      if (
                        await save("annotate", {
                          opportunityId: next.id,
                          roleFamilyId: next.roleFamilyId,
                          provenance: [],
                        })
                      )
                        setDetail(next);
                    }}
                  >
                    <option value="">Unmatched</option>
                    {roles.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                <details>
                  <summary>Job description</summary>
                  <pre>{detail.description || "Not captured"}</pre>
                </details>
                <details>
                  <summary>Application answers</summary>
                  <pre>{detail.answers || "Not captured"}</pre>
                </details>
                {(detail.offer ||
                  (detail.applicationId &&
                    appIndex.get(detail.applicationId)?.status ===
                      "offer")) && (
                  <OfferTerms opportunity={detail} save={save} />
                )}
                <h3>Evidence</h3>
                {detail.provenance.map((p) => (
                  <div className="provenance" key={p.id}>
                    <strong>{p.kind}</strong>
                    <p>{p.text}</p>
                    <small>
                      {p.source} · {p.recordedAt}
                    </small>
                  </div>
                ))}
              </article>
            ) : tab === "records" ? (
              <div className="records-list">
                {records.slice(0, limit).map((o) => (
                  <button
                    className="record-row"
                    key={o.id}
                    onClick={() => setDetail(o)}
                  >
                    <strong>{o.company}</strong>
                    <span>{o.title}</span>
                    <small>
                      {o.location} · {o.lifecycle}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="records-list">
                {companies.slice(0, limit).map(([key, list]) => (
                  <details className="company-history" key={key}>
                    <summary>
                      {list[0].company} · {list.length} roles ·{" "}
                      {counts(list).submitted} applied
                      {standings.has(key) && (
                        <>
                          {" "}
                          · <CompanyCap standing={standings.get(key)!} />
                        </>
                      )}
                    </summary>
                    <CompanyPolicyEditor
                      company={list[0].company}
                      policy={career.companyPolicies.find(
                        (p) => p.companyKey === key,
                      )}
                      onSave={(policy) =>
                        void save("company-policy", { policy })
                      }
                      onRemove={() =>
                        void save("company-policy", {
                          companyKey: key,
                          remove: true,
                        })
                      }
                    />
                    {list.slice(0, companyLimits[key] ?? 50).map((o) => (
                      <button
                        className="record-row"
                        key={o.id}
                        onClick={() => setDetail(o)}
                      >
                        <span>{o.title}</span>
                        <small>
                          {o.lifecycle} ·{" "}
                          {o.submittedAt?.slice(0, 10) ||
                            (o.lifecycle === "confirmed"
                              ? "Submission date unknown"
                              : "No confirmed submission")}
                        </small>
                      </button>
                    ))}
                    {list.length > (companyLimits[key] ?? 50) && (
                      <button
                        onClick={() =>
                          setCompanyLimits((current) => ({
                            ...current,
                            [key]: (current[key] ?? 50) + 50,
                          }))
                        }
                      >
                        Show 50 more roles
                      </button>
                    )}
                  </details>
                ))}
              </div>
            )}
            {!detail &&
              (tab === "records" ? records.length : companies.length) >
                limit && (
                <button onClick={() => setLimit((n) => n + 50)}>
                  Show 50 more
                </button>
              )}
          </>
        )}
        {tab === "analysis" && (
          <Outcomes
            career={career}
            applications={applications}
            onSelect={onSelect}
            onEvidence={onEvidence}
          />
        )}
      </div>
    </Popup>
  );
}
function OfferTerms({
  opportunity,
  save,
}: {
  opportunity: Opportunity;
  save: (action: string, payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const offer = opportunity.offer;
  const baseOffer = useRef(JSON.stringify(offer));
  const [offerError, setOfferError] = useState("");
  return (
    <details open className="offer-terms">
      <summary>Offer details</summary>
      <form
        className="career-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setOfferError("");
          if (baseOffer.current !== JSON.stringify(offer)) {
            setOfferError(
              "Offer details changed elsewhere. Your draft is preserved; reopen this record to compare the saved terms.",
            );
            return;
          }
          const f = new FormData(e.currentTarget);
          const number = (key: string) =>
            f.get(key) === "" ? null : Number(f.get(key));
          const nextOffer = {
            currency: String(f.get("currency")).toUpperCase(),
            base: number("base"),
            bonus: number("bonus"),
            equity: String(f.get("equity")),
            location: String(f.get("location")),
            deadline: String(f.get("deadline")) || null,
            decision: f.get("decision"),
          };
          const saved = await save("annotate", {
            opportunityId: opportunity.id,
            offer: nextOffer,
            provenance: [
              {
                id: uid(),
                kind: "user",
                text: String(f.get("source")),
                source: "Offer details entered in Career Atlas",
                recordedAt: new Date().toISOString(),
              },
            ],
          });
          if (saved) baseOffer.current = JSON.stringify(nextOffer);
        }}
      >
        {offerError && <p role="alert">{offerError}</p>}
        <div className="form-pair">
          <label>
            Annual base
            <input
              name="base"
              type="number"
              min="0"
              defaultValue={offer?.base ?? ""}
            />
          </label>
          <label>
            Currency
            <input
              name="currency"
              minLength={3}
              maxLength={3}
              required
              defaultValue={offer?.currency ?? "USD"}
            />
          </label>
        </div>
        <label>
          Bonus
          <input
            name="bonus"
            type="number"
            min="0"
            defaultValue={offer?.bonus ?? ""}
          />
        </label>
        <label>
          Equity terms
          <textarea name="equity" defaultValue={offer?.equity ?? ""} />
        </label>
        <label>
          Location
          <input
            name="location"
            defaultValue={offer?.location ?? opportunity.location}
          />
        </label>
        <label>
          Decision deadline
          <input
            name="deadline"
            type="date"
            defaultValue={offer?.deadline ?? ""}
          />
        </label>
        <label>
          Decision
          <select name="decision" defaultValue={offer?.decision ?? "pending"}>
            {["pending", "accepted", "declined", "expired"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Source or note
          <textarea
            name="source"
            required
            placeholder="Offer letter or conversation date"
          />
        </label>
        <button>Save offer details</button>
      </form>
    </details>
  );
}

function Outcomes({
  career,
  applications,
  onSelect,
  onEvidence,
}: {
  career: CareerState;
  applications: Application[];
  onSelect: (id: string) => void;
  onEvidence: (applicationId: string, evidenceId: string) => void;
}) {
  const [group, setGroup] = useState<{
    name: string;
    kind: "role" | "resume";
    key: string;
    status?: string;
  } | null>(null);
  const [limit, setLimit] = useState(50),
    [resumeLimit, setResumeLimit] = useState(20),
    [messageLimit, setMessageLimit] = useState(20);
  const data = useMemo(() => {
    const opportunities = new Map(
      career.opportunities
        .filter((o) => o.applicationId)
        .map((o) => [o.applicationId!, o]),
    );
    const families = new Map(career.families.map((f) => [f.id, f]));
    const byRole = new Map<string, Application[]>();
    const resumes = new Map<
      string,
      {
        hash: string;
        label: string;
        apps: Application[];
        applicationId: string;
        evidenceId: string;
      }
    >();
    const messages: {
      id: string;
      app: Application;
      text: string;
      source: string;
      evidenceId?: string;
    }[] = [];
    const messageKeys = new Set<string>();
    const addMessage = (row: (typeof messages)[number]) => {
      const key = `${row.app.id}:${row.text.toLowerCase().replace(/\s+/g, " ").trim()}`;
      if (row.text.trim() && !messageKeys.has(key)) {
        messageKeys.add(key);
        messages.push(row);
      }
    };
    for (const app of applications) {
      const opportunity = opportunities.get(app.id);
      const family = opportunity?.roleFamilyId;
      const familyId = family && families.has(family) ? family : "unmatched";
      const roles = byRole.get(familyId) ?? [];
      roles.push(app);
      byRole.set(familyId, roles);
      const hashes = new Set<string>();
      for (const evidence of app.evidence) {
        if (
          evidence.kind === "resume" &&
          evidence.sha256 &&
          evidence.file &&
          !hashes.has(evidence.sha256)
        ) {
          hashes.add(evidence.sha256);
          const row = resumes.get(evidence.sha256) ?? {
            hash: evidence.sha256,
            label: /\.(pdf|docx?|txt)$/i.test(evidence.label)
              ? evidence.label.split(/[\\/]/).pop()!
              : `${app.company} · ${app.title}`,
            apps: [],
            applicationId: app.id,
            evidenceId: evidence.id,
          };
          row.apps.push(app);
          resumes.set(evidence.sha256, row);
        }
        if (
          evidence.kind === "feedback" &&
          !evidence.id.startsWith("title-family-")
        )
          addMessage({
            id: evidence.id,
            app,
            text: evidence.text,
            source: evidence.basis || evidence.label,
            evidenceId: evidence.id,
          });
      }
      for (const evidence of opportunity?.provenance ?? [])
        if (
          evidence.kind === "employer" &&
          !evidence.id.startsWith("title-family-")
        )
          addMessage({
            id: `${app.id}:${evidence.id}`,
            app,
            text: evidence.text,
            source: evidence.source,
          });
    }
    return {
      roles: [...byRole]
        .map(([id, apps]) => ({
          id,
          name: families.get(id)?.name ?? "Unmatched",
          rank: families.get(id)?.rank ?? 21,
          apps,
        }))
        .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)),
      resumes: [...resumes.values()].sort(
        (a, b) => b.apps.length - a.apps.length || a.hash.localeCompare(b.hash),
      ),
      messages,
    };
  }, [career.opportunities, career.families, applications]);
  const show = (
    name: string,
    kind: "role" | "resume",
    key: string,
    status?: string,
  ) => {
    setGroup({ name, kind, key, status });
    setLimit(50);
  };
  const statuses = [
    { label: "Awaiting", test: (a: Application) => a.status === "pending" },
    {
      label: "Interview process",
      test: (a: Application) =>
        a.events.some((e) => e.kind === "invitation" || e.kind === "interview"),
    },
    { label: "Rejected", test: (a: Application) => a.status === "rejected" },
    { label: "Offers", test: (a: Application) => a.status === "offer" },
    { label: "Closed", test: (a: Application) => a.status === "closed" },
  ];
  function resultCells(
    apps: Application[],
    name: string,
    kind: "role" | "resume",
    key: string,
  ) {
    return statuses.map((s) => {
      const matches = apps.filter(s.test);
      return (
        <td key={s.label}>
          {matches.length ? (
            <button
              aria-label={`${s.label}: ${name}, ${matches.length} applications`}
              onClick={() =>
                show(`${name} · ${s.label.toLowerCase()}`, kind, key, s.label)
              }
            >
              {matches.length}
            </button>
          ) : (
            0
          )}
        </td>
      );
    });
  }
  if (group) {
    const cohort =
      group.kind === "role"
        ? (data.roles.find((r) => r.id === group.key)?.apps ?? [])
        : (data.resumes.find((r) => r.hash === group.key)?.apps ?? []);
    const filter = group.status
      ? statuses.find((s) => s.label === group.status)?.test
      : null;
    const matches = filter ? cohort.filter(filter) : cohort;
    return (
      <section className="outcome-detail">
        <button onClick={() => setGroup(null)}>All outcomes</button>
        <h2>{group.name}</h2>
        <p>{matches.length} applications</p>
        <div className="records-list">
          {matches.slice(0, limit).map((app) => {
            const resume =
              group.kind === "resume"
                ? app.evidence.find(
                    (e) =>
                      e.kind === "resume" && e.sha256 === group.key && e.file,
                  )
                : undefined;
            return (
              <article className="outcome-application" key={app.id}>
                <button className="record-row" onClick={() => onSelect(app.id)}>
                  <strong>{app.company}</strong>
                  <span>{app.title}</span>
                  <small>
                    {statusLabels[app.status]} ·{" "}
                    {app.submitted ?? "Submission date unknown"}
                  </small>
                </button>
                {resume && (
                  <button onClick={() => onEvidence(app.id, resume.id)}>
                    View resume for {app.company}
                  </button>
                )}
              </article>
            );
          })}
        </div>
        {matches.length > limit && (
          <button onClick={() => setLimit((n) => n + 50)}>
            Show 50 more applications
          </button>
        )}
      </section>
    );
  }
  return (
    <section className="outcomes-analysis">
      <h2>Outcomes</h2>
      <p>{applications.length} confirmed applications</p>
      <h3>By role family</h3>
      {applications.length ? (
        <>
          <div className="table-scroll">
            <table className="role-outcomes">
              <thead>
                <tr>
                  <th>Role family</th>
                  <th>Applied</th>
                  {statuses.map((s) => (
                    <th key={s.label}>{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.roles.map((r) => (
                  <tr key={r.id}>
                    <th>
                      <button onClick={() => show(r.name, "role", r.id)}>
                        {r.name}
                      </button>
                    </th>
                    <td>{r.apps.length}</td>
                    {resultCells(r.apps, r.name, "role", r.id)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Interview process includes invitations and completed interviews,
            including applications later rejected or closed.
          </p>
        </>
      ) : (
        <p>No confirmed applications yet.</p>
      )}
      {data.resumes.length > 0 && <h3>By resume</h3>}
      {data.resumes.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="resume-outcomes">
              <thead>
                <tr>
                  <th>Exact file</th>
                  <th>Applications</th>
                  {statuses.map((s) => (
                    <th key={s.label}>{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.resumes.slice(0, resumeLimit).map((r) => (
                  <tr key={r.hash}>
                    <th>
                      <button onClick={() => show(r.label, "resume", r.hash)}>
                        {r.label}
                      </button>
                      <button
                        className="resume-open"
                        aria-label={`View resume: ${r.label}`}
                        onClick={() =>
                          onEvidence(r.applicationId, r.evidenceId)
                        }
                      >
                        View resume
                      </button>
                      <details className="resume-file-info">
                        <summary>File details</summary>
                        <code>SHA-256 {r.hash}</code>
                      </details>
                    </th>
                    <td>{r.apps.length}</td>
                    {resultCells(r.apps, r.label, "resume", r.hash)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.resumes.length > resumeLimit && (
            <button onClick={() => setResumeLimit((n) => n + 20)}>
              Show 20 more resume files
            </button>
          )}
        </>
      )}
      <h3>Remote against on-site</h3>
      <div className="table-scroll">
        <table className="arrangement-outcomes">
          <thead>
            <tr>
              <th>Arrangement</th>
              <th>Applied</th>
              <th>Responded</th>
              <th>Response rate</th>
              <th>Offers</th>
            </tr>
          </thead>
          <tbody>
            {arrangementConversion(applications).map((row) => (
              <tr key={row.id}>
                <th>{row.label}</th>
                <td>{row.applied}</td>
                <td>{row.responded}</td>
                <td>{formatRate(row.rate)}</td>
                <td>{row.offers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        A response means the employer moved the application past Applied. A
        rejection without an interview counts as no response.
      </p>
      <h3>Employer messages</h3>
      {!data.messages.length && <p>No employer feedback is linked yet.</p>}
      {data.messages.slice(0, messageLimit).map((m) => (
        <details className="provenance employer-message" key={m.id}>
          <summary>
            {m.app.company} · {m.app.title}
          </summary>
          <p>{m.text}</p>
          <small>{m.source}</small>
          <button
            onClick={() =>
              m.evidenceId
                ? onEvidence(m.app.id, m.evidenceId)
                : onSelect(m.app.id)
            }
          >
            View source record
          </button>
        </details>
      ))}
      {data.messages.length > messageLimit && (
        <button onClick={() => setMessageLimit((n) => n + 20)}>
          Show 20 more messages
        </button>
      )}
    </section>
  );
}

/** "2 of 3 in 90 days" with the reopening date when the cap is reached. */
function CompanyCap({ standing }: { standing: CompanyStanding }) {
  return (
    <b
      className="company-cap"
      data-at-cap={standing.atCap ? "true" : "false"}
      title="Employer application limit"
    >
      {standing.used} of {standing.max} in {standing.windowDays} days
      {standing.atCap
        ? standing.nextEligibleAt
          ? ` · next ${standing.nextEligibleAt.slice(0, 10)}`
          : " · reconcile undated attempts"
        : ""}
    </b>
  );
}
function CompanyPolicyEditor({
  company,
  policy,
  onSave,
  onRemove,
}: {
  company: string;
  policy: CareerState["companyPolicies"][number] | undefined;
  onSave: (policy: CareerState["companyPolicies"][number]) => void;
  onRemove: () => void;
}) {
  const [max, setMax] = useState(String(policy?.maxApplications ?? ""));
  const [days, setDays] = useState(String(policy?.windowDays ?? ""));
  const [source, setSource] = useState(policy?.source ?? "");
  return (
    <form
      className="company-policy"
      onSubmit={(e) => {
        e.preventDefault();
        if (!Number(max) || !Number(days) || !source.trim()) return;
        onSave({
          company,
          companyKey: company,
          maxApplications: Number(max),
          windowDays: Number(days),
          source: source.trim(),
          note: policy?.note ?? "",
          recordedAt: new Date().toISOString(),
        });
      }}
    >
      <label>
        Limit
        <input
          type="number"
          min={1}
          max={100}
          value={max}
          onChange={(e) => setMax(e.target.value)}
          aria-label={`${company} application limit`}
        />
      </label>
      <label>
        per
        <input
          type="number"
          min={1}
          max={730}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          aria-label={`${company} limit window in days`}
        />
        days
      </label>
      <input
        value={source}
        placeholder="Where the employer states it"
        onChange={(e) => setSource(e.target.value)}
        aria-label={`${company} limit source`}
      />
      <button type="submit">{policy ? "Update limit" : "Save limit"}</button>
      {policy && (
        <button type="button" className="quiet-button" onClick={onRemove}>
          Remove limit
        </button>
      )}
    </form>
  );
}
