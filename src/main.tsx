import { geographicGroups } from "../shared/locations";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  statusLabels,
  themeLabels,
  type Application,
  type Theme,
} from "../shared/model";
import { useWorkspace, useMedia } from "./useWorkspace";
import { JourneyScene } from "./JourneyScene";
import { Scene } from "./Scene";
import { Popup } from "./Popup";
import { CareerPanel } from "./CareerPanel";
import {
  cleanDisplay,
  shortLocation,
  eventGaps,
  sinceDigest,
  today,
} from "./journey";
import { Cadence } from "./Cadence";
import "./style.css";
const PdfDocument = lazy(() =>
  import("./PdfDocument").then((m) => ({ default: m.PdfDocument })),
);
const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value + "T12:00:00Z"))
    : "Date not established";
function App() {
  const {
    snapshot,
    error,
    clearError,
    connected,
    command,
    careerCommand,
    newIds,
    pendingArrivalIds,
    playArrivals,
    pauseArrivals,
  } = useWorkspace();
  const [careerTab, setCareerTab] = useState<
    "roles" | "records" | "analysis" | null
  >(null);
  /* The digest compares dated events against the day of the previous visit,
     kept per workspace in this browser only. The day moves forward when the
     digest is dismissed, or when a visit ends with nothing left to show, so
     a reload never hides what you have not looked at. */
  const [lastLooked, setLastLooked] = useState<string | null>(null);
  const digestPending = useRef(false);
  const lookedKey = snapshot?.workspaceId
    ? `career-atlas.looked.v1.${snapshot.workspaceId}`
    : null;
  const remember = (day: string) => {
    try {
      if (lookedKey) localStorage.setItem(lookedKey, day);
    } catch {
      /* Private mode: the digest is simply unavailable. */
    }
  };
  useEffect(() => {
    if (!lookedKey) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(lookedKey);
    } catch {
      /* See above. */
    }
    if (!stored) remember(today());
    setLastLooked(stored);
    const leave = () => {
      if (!digestPending.current) remember(today());
    };
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [lookedKey]);
  const markLooked = () => {
    remember(today());
    setLastLooked(null);
  };
  const [search, setSearch] = useState(""),
    [sourceInfo, setSourceInfo] = useState(false),
    [visible, setVisible] = useState(!document.hidden);
  const mainRef = useRef<HTMLElement>(null);
  const [arrivalAreaVisible, setArrivalAreaVisible] = useState(false);
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const input = useRef<HTMLInputElement>(null),
    searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const view = snapshot?.view;
  useEffect(() => {
    if (view) setSearch(view.query);
  }, [view?.query]);
  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  useEffect(() => {
    if (view?.list && !view.selectedId) {
      input.current?.focus();
    }
  }, [view?.list, view?.selectedId]);
  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!view?.list || view.selectedId || search === view.query) return;
    searchTimer.current = setTimeout(
      () => void command("filter", { query: search }),
      180,
    );
    return () => clearTimeout(searchTimer.current);
  }, [search, view?.list, view?.selectedId]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const editing = (e.target as HTMLElement).matches("input,textarea");
      if (
        (e.key === "k" && (e.metaKey || e.ctrlKey)) ||
        (e.key === "/" && !editing)
      ) {
        e.preventDefault();
        void command("list", { enabled: true });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [command]);
  const applications = snapshot?.applications ?? [],
    v = view;
  const cityGroups = useMemo(
    () => geographicGroups(applications),
    [applications],
  );
  const cityIds = useMemo(
    () =>
      v?.city
        ? new Set(cityGroups.find((g) => g.id === v.city)?.ids ?? [])
        : null,
    [cityGroups, v?.city],
  );
  const flowIds = useMemo(
    () => (v?.flowIds ? new Set(v.flowIds) : null),
    [v?.flowIds],
  );
  const [resultLimit, setResultLimit] = useState(60);
  useEffect(() => setResultLimit(60), [search, v?.city, v?.flowIds, v?.status]);
  const roleIds = useMemo(() => {
    if (!v?.roleFamilyId || !snapshot?.career) return null;
    return new Set(
      snapshot.career.opportunities
        .filter((o) =>
          v.roleFamilyId === "unmatched"
            ? !o.roleFamilyId
            : o.roleFamilyId === v.roleFamilyId,
        )
        .flatMap((o) => (o.applicationId ? [o.applicationId] : [])),
    );
  }, [snapshot?.career, v?.roleFamilyId]);
  const matches = useMemo(
    () =>
      applications.filter(
        (a) =>
          `${a.company} ${a.title} ${a.location}`
            .toLowerCase()
            .includes(search.toLowerCase().trim()) &&
          (!v || v.status === "all" || v.status === a.status) &&
          (!flowIds || flowIds.has(a.id)) &&
          (!cityIds || cityIds.has(a.id)) &&
          (!roleIds || roleIds.has(a.id)),
      ),
    [applications, search, v?.status, flowIds, cityIds, roleIds],
  );
  const visibleApplications = useMemo(
    () =>
      applications.filter(
        (a) =>
          (!cityIds || cityIds.has(a.id)) && (!roleIds || roleIds.has(a.id)),
      ),
    [applications, cityIds, roleIds],
  );
  useEffect(() => {
    setArrivalAreaVisible(false);
    if (!snapshot || !mainRef.current) return;
    const targets = [
      mainRef.current.querySelector('.stage-hub[aria-label^="Applied:"]'),
      mainRef.current.querySelector(
        '.rim-outcome[aria-label^="Awaiting response:"]',
      ),
    ].filter((node): node is Element => !!node);
    if (targets.length !== 2) return;
    const visibleTargets = new Map<Element, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          visibleTargets.set(
            entry.target,
            entry.isIntersecting && entry.intersectionRatio >= 0.9,
          );
        setArrivalAreaVisible(
          targets.every((target) => visibleTargets.get(target)),
        );
      },
      { threshold: [0, 0.9, 1] },
    );
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [Boolean(snapshot), v?.theme]);
  const arrivalEligibleKey = matches
    .filter((a) => a.status === "pending")
    .map((a) => a.id)
    .join("|");
  const canPlayArrivals =
    visible &&
    arrivalAreaVisible &&
    !!v?.motion &&
    !careerTab &&
    !sourceInfo &&
    !v?.selectedId &&
    !v?.list &&
    !v?.evidenceId;
  useEffect(() => {
    const eligible = arrivalEligibleKey ? arrivalEligibleKey.split("|") : [];
    if (!canPlayArrivals || newIds.some((id) => !eligible.includes(id)))
      pauseArrivals();
    else playArrivals(eligible);
  }, [
    canPlayArrivals,
    arrivalEligibleKey,
    pendingArrivalIds.join("|"),
    newIds.join("|"),
    playArrivals,
    pauseArrivals,
  ]);
  async function watchArrivals() {
    setCareerTab(null);
    setSourceInfo(false);
    await command("reset");
    await command("motion", { enabled: true });
    mainRef.current?.querySelector(".journey-viewport")?.scrollIntoView({
      block: "center",
      behavior: reduced ? "auto" : "smooth",
    });
  }
  async function select(id: string) {
    clearTimeout(searchTimer.current);
    if (snapshot?.view.list && search !== snapshot.view.query)
      await command("filter", { query: search });
    void command("select", { id });
  }
  if (!snapshot || !v)
    return (
      <main className="loading">
        <span className="wordmark">
          career<span>atlas</span>
        </span>
        <p>{error || "Opening your local workspace…"}</p>
        {error && <button onClick={() => location.reload()}>Reconnect</button>}
      </main>
    );
  const selected = applications.find((a) => a.id === v.selectedId),
    evidence = selected?.evidence.find((e) => e.id === v.evidenceId),
    moving = v.motion && !reduced && visible;
  const geography = v.city
    ? cityGroups.find((g) => g.id === v.city)
    : undefined;
  const syncProblem = !connected
    ? "Reconnecting"
    : snapshot.sync.enabled && snapshot.sync.state === "error"
      ? "Source needs attention"
      : null;
  async function goCity(city: Theme) {
    await command("location", { city });
  }
  const asOf = applications.reduce(
    (day, a) => (a.asOf > day ? a.asOf : day),
    "",
  );
  const digest = lastLooked ? sinceDigest(applications, lastLooked) : null;
  const digestParts = digest
    ? [
        [digest.offers.length, "offer"],
        [digest.interviews.length, "interview"],
        [digest.invitations.length, "invitation"],
        [digest.rejected.length, "rejection"],
        [digest.closed.length, "closed"],
      ]
        .filter(([n]) => n)
        .map(
          ([n, word]) =>
            `${n} ${word}${n === 1 || word === "closed" ? "" : "s"}`,
        )
    : [];
  digestPending.current = digestParts.length > 0;
  const digestIds = digest
    ? [
        ...new Set(
          [
            ...digest.offers,
            ...digest.interviews,
            ...digest.invitations,
            ...digest.rejected,
            ...digest.closed,
          ].map((a) => a.id),
        ),
      ]
    : [];
  const title =
    evidence?.label ??
    (selected
      ? `${selected.company} · application`
      : v.flowIds
        ? "Applications on this path"
        : "Find an application");
  const openPopup = !!selected || v.list || sourceInfo;
  const close = () => {
    setSourceInfo(false);
    void command("close");
  };
  return (
    <div
      className={`app ${moving ? "motion-on" : "motion-off"}`}
      data-theme={v.theme}
      data-revision={v.revision}
    >
      <main id="scene-workspace" ref={mainRef}>
        <header className="scene-header">
          <div className="heading">
            <span className="wordmark">
              career<span>atlas</span>
            </span>
          </div>
          <button
            className="search-trigger"
            onClick={() => void command("list", { enabled: true })}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <circle cx="10" cy="10" r="6" />
              <path d="m15 15 6 6" />
            </svg>
            <span>Find an application</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="top-controls">
            <button
              className="quiet-button"
              onClick={() => setCareerTab("roles")}
            >
              Top roles
            </button>
            <button
              className="quiet-button"
              onClick={() => setCareerTab("records")}
            >
              All records
            </button>
            <button
              className="quiet-button"
              onClick={() => setCareerTab("analysis")}
            >
              Outcomes
            </button>
          </div>
        </header>
        <div className="scene-utility">
          <div className="navigation">
            {(v.theme !== "neutral" ||
              v.city !== null ||
              v.roleFamilyId !== null) && (
              <button
                className="quiet-button"
                onClick={() => void command("reset")}
                aria-label="Back to globe"
              >
                ← Back
              </button>
            )}
            {(v.query || v.status !== "all") && (
              <span className="filter-hint">
                Highlighting{" "}
                {v.query || statusLabels[v.status as keyof typeof statusLabels]}
              </span>
            )}
          </div>
        </div>
        {error && (
          <div className="error-toast" role="alert">
            {error}
            <button onClick={clearError}>Dismiss</button>
          </div>
        )}
        {(v.roleFamilyId || geography) && (
          <div className="geography-controls">
            {v.roleFamilyId && (
              <strong className="selected-role">
                {v.roleFamilyId === "unmatched"
                  ? "Unmatched roles"
                  : snapshot.career.families.find(
                      (f) => f.id === v.roleFamilyId,
                    )?.name}{" "}
                · {visibleApplications.length} applied
              </strong>
            )}
            {geography ? (
              <>
                <strong>
                  {geography.label} · {visibleApplications.length} applications
                </strong>
                <button
                  onClick={() => void command("flow", { ids: geography.ids })}
                >
                  Explore these applications
                </button>
              </>
            ) : null}
          </div>
        )}
        <JourneyScene
          background={(selection) => (
            <Scene
              theme={v.theme}
              moving={moving}
              home={snapshot.homeLocation}
              applications={applications}
              {...selection}
              onCity={goCity}
            />
          )}
          applications={visibleApplications}
          places={cityGroups}
          onPlace={(id) => void goCity(id as Theme)}
          onSelection={(selection) => void command("selection", { selection })}
          onCloseSilent={(ids) => void command("close-silent", { ids })}
          suppressDetails={Boolean(careerTab || openPopup || sourceInfo)}
          view={v}
          moving={moving}
          newIds={newIds}
          onSelect={(id) => void select(id)}
          query={search}
        />
        {applications.length === 0 && (
          <div className="empty-workspace">
            <h2>Your first path starts here</h2>
            <p>Import a dataset to explore it in this scene.</p>
          </div>
        )}
        <div className="scene-bottom">
          <div className="motion-control">
            <button
              className="round-button"
              aria-label={v.motion ? "Pause motion" : "Resume motion"}
              aria-pressed={!v.motion}
              onClick={() => void command("motion", { enabled: !v.motion })}
            >
              {v.motion ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5v14M16 5v14" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m8 5 11 7-11 7Z" />
                </svg>
              )}
            </button>
            <div>
              <strong>{applications.length} confirmed applications</strong>
              {snapshot.career && (
                <span>
                  {snapshot.career.opportunities.length} tracked records
                </span>
              )}
              <span>
                {asOf
                  ? `Evidence through ${formatDate(asOf)}`
                  : "No imported records"}
              </span>
            </div>
          </div>
          {!geography && (
            <div className="globe-hint">
              Select a stage to see where those applications are. Drag the globe
              or use arrow keys to turn it.
            </div>
          )}
          <div className="scene-status">
            <Cadence applications={applications} />
            {digestParts.length > 0 && (
              <div className="digest" role="status">
                <button
                  className="quiet-button"
                  onClick={() => void command("flow", { ids: digestIds })}
                >
                  Since {formatDate(lastLooked)}: {digestParts.join(", ")}
                </button>
                <button
                  className="quiet-button digest-dismiss"
                  aria-label="Dismiss digest"
                  onClick={markLooked}
                >
                  ×
                </button>
              </div>
            )}
            {pendingArrivalIds.length > 0 && (
              <button
                className="quiet-button"
                onClick={() => void watchArrivals()}
              >
                Watch {pendingArrivalIds.length} new{" "}
                {pendingArrivalIds.length === 1
                  ? "application"
                  : "applications"}
              </button>
            )}
            {syncProblem && (
              <button
                className="sync-status"
                onClick={() => setSourceInfo(true)}
              >
                <i />
                <span>{syncProblem}</span>
              </button>
            )}
          </div>
        </div>
      </main>
      {careerTab && snapshot.career ? (
        <CareerPanel
          key={careerTab}
          initial={careerTab}
          career={snapshot.career}
          applications={applications}
          onClose={() => setCareerTab(null)}
          command={careerCommand}
          onSelect={(id) => {
            setCareerTab(null);
            void select(id);
          }}
          onEvidence={(applicationId, evidenceId) => {
            setCareerTab(null);
            void (async () => {
              await command("select", { id: applicationId });
              await command("document", { id: evidenceId });
            })();
          }}
          onRole={(id) => {
            setCareerTab(null);
            void command("role", { id });
          }}
        />
      ) : sourceInfo ? (
        <Popup title="Source updates" onClose={() => setSourceInfo(false)}>
          <div className="popup-body source-info">
            <h2>{snapshot.sync.enabled ? "Sources" : "Local workspace"}</h2>
            <p>{snapshot.sync.message}</p>
            {snapshot.sync.checkedAt && (
              <p>
                Last checked:{" "}
                {new Date(snapshot.sync.checkedAt).toLocaleTimeString()}
              </p>
            )}
            <p>{snapshot.coverage}</p>
            <p>
              {snapshot.homeLocation.status === "resume"
                ? `Globe centered on ${snapshot.homeLocation.label}, from your resume contact header.`
                : snapshot.homeLocation.status === "conflict"
                  ? "Resume headers name different home locations. Globe center is unset."
                  : "No confirmed home location in the imported resume headers. Globe center is unset."}
            </p>
          </div>
        </Popup>
      ) : (
        openPopup && (
          <Popup
            title={title}
            wide={!!evidence}
            onClose={close}
            onBack={() => void command("back")}
            canGoBack={snapshot.canGoBack}
          >
            {evidence ? (
              <div className="popup-body evidence-view">
                <div className="document-heading">
                  <div>
                    <span className="eyebrow">{selected!.company}</span>
                    <h2>{evidence.label}</h2>
                  </div>
                  {evidence.file && (
                    <a
                      href={evidence.file}
                      download={`${evidence.id}.${evidence.mediaType === "application/pdf" ? "pdf" : "txt"}`}
                      className="download-link"
                    >
                      Download
                    </a>
                  )}
                </div>
                <p className="evidence-basis">{evidence.basis}</p>
                {evidence.file && evidence.mediaType === "application/pdf" ? (
                  <Suspense fallback={<p>Opening document…</p>}>
                    <PdfDocument url={evidence.file} label={evidence.label} />
                  </Suspense>
                ) : (
                  <pre className="source-text">{evidence.text}</pre>
                )}
                {evidence.sha256 && (
                  <details className="hash-details">
                    <summary>File identity</summary>
                    <p>SHA-256 {evidence.sha256}</p>
                  </details>
                )}
              </div>
            ) : selected ? (
              <ApplicationCard
                application={selected}
                onDocument={(id) => void command("document", { id })}
              />
            ) : (
              <div className="popup-body search-view">
                <label htmlFor="application-search" className="sr-only">
                  Find an application
                </label>
                <div className="search-field">
                  <svg
                    viewBox="0 0 24 24"
                    width="19"
                    height="19"
                    aria-hidden="true"
                  >
                    <circle cx="10" cy="10" r="6" />
                    <path d="m15 15 6 6" />
                  </svg>
                  <input
                    ref={input}
                    id="application-search"
                    placeholder="Company, role or location…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && matches[0])
                        void select(matches[0].id);
                    }}
                    autoComplete="off"
                  />
                  {search && (
                    <button
                      aria-label="Clear search"
                      onClick={() => setSearch("")}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="search-meta">
                  <span>
                    {matches.length} result{matches.length === 1 ? "" : "s"}
                  </span>
                  {v.flowIds && (
                    <button
                      onClick={() => void command("list", { enabled: true })}
                    >
                      Search all applications
                    </button>
                  )}
                </div>
                <div className="search-results">
                  {matches.slice(0, resultLimit).map((a) => (
                    <button
                      key={a.id}
                      className="search-result"
                      onClick={() => void select(a.id)}
                    >
                      <span className={`result-dot ${a.status}`} />
                      <span className="result-copy">
                        <strong>{a.company}</strong>
                        <span>{cleanDisplay(a.title)}</span>
                        <small>
                          {shortLocation(a.location)} · {statusLabels[a.status]}
                        </small>
                      </span>
                      <span aria-hidden="true">↗</span>
                    </button>
                  ))}
                  {matches.length > resultLimit && (
                    <button
                      className="load-more"
                      onClick={() => setResultLimit((n) => n + 60)}
                    >
                      Show more ({matches.length - resultLimit} remaining)
                    </button>
                  )}
                  {matches.length === 0 && (
                    <div className="empty-results">
                      <h2>No applications here yet</h2>
                      <p>
                        {v.flowIds
                          ? "This stage or outcome has no matching records."
                          : "Try a company name, a role or a location."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Popup>
        )
      )}
      <div className="sr-only" aria-live="polite">
        {selected ? `Selected ${selected.company}.` : ""}
        {applications.length} applications. Scene: {themeLabels[v.theme]}.
      </div>
    </div>
  );
}
function ApplicationCard({
  application: a,
  onDocument,
}: {
  application: Application;
  onDocument: (id: string) => void;
}) {
  const docs = a.evidence.filter(
      (e) => e.kind === "resume" || e.kind === "feedback",
    ),
    other = a.evidence.filter((e) => !docs.includes(e));
  const submittedResumes = docs.filter((e) => e.kind === "resume" && e.file);
  const gaps = eventGaps(a);
  return (
    <div className="popup-body application-card">
      <span className="eyebrow">{shortLocation(a.location)}</span>
      <h2>{a.company}</h2>
      <p className="role-title">{cleanDisplay(a.title)}</p>
      <span className={`status-label ${a.status}`}>
        {statusLabels[a.status]}
      </span>
      <section
        className="submitted-materials"
        aria-label="Application documents"
      >
        <div className="document-shortcuts">
          {submittedResumes.map((e, index) => (
            <button
              className="submitted-resume"
              key={e.id}
              onClick={() => onDocument(e.id)}
            >
              Resume used to apply
              {submittedResumes.length > 1 ? ` · ${index + 1}` : ""} ↗
              <small>{e.label}</small>
            </button>
          ))}
          {docs
            .filter((e) => e.kind === "feedback")
            .map((e) => (
              <button key={e.id} onClick={() => onDocument(e.id)}>
                Employer feedback ↗
              </button>
            ))}
        </div>
        {submittedResumes.length === 0 && (
          <p className="missing-resume">
            No resume file found for this application.
          </p>
        )}
        {docs
          .filter((e) => e.kind === "resume" && !e.file)
          .map((e) => (
            <button
              className="inline-link"
              key={e.id}
              onClick={() => onDocument(e.id)}
            >
              Resume notes ↗
            </button>
          ))}
      </section>
      <ol className="timeline">
        {a.events.map((e, i) => (
          <li key={e.id}>
            <time>
              {formatDate(e.date)}
              {gaps[i] !== null && gaps[i]! > 0 && (
                <small className="event-gap">+{gaps[i]} days</small>
              )}
            </time>
            <strong>{e.label}</strong>
            <p>{e.detail}</p>
            {e.evidenceIds.length > 0 && (
              <button
                className="inline-link"
                onClick={() => onDocument(e.evidenceIds[0])}
              >
                View source
              </button>
            )}
          </li>
        ))}
      </ol>
      <details className="application-terms">
        <summary>Role details & source records</summary>
        <dl>
          <dt>Location</dt>
          <dd>{cleanDisplay(a.location)}</dd>
          <dt>Compensation</dt>
          <dd>{cleanDisplay(a.compensation)}</dd>
        </dl>
        <p>{a.verification}</p>
        {other.map((e) => (
          <button key={e.id} onClick={() => onDocument(e.id)}>
            {e.label} ↗
          </button>
        ))}
      </details>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
