import { availableScenes, geographicGroups } from "../shared/locations";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  statusLabels,
  themeLabels,
  type Application,
  type Evidence,
  type View,
} from "../shared/model";
import { useWorkspace, useMedia } from "./useWorkspace";
import { JourneyScene } from "./JourneyScene";
import { Atmosphere } from "./Atmosphere";
import { Popup } from "./Popup";
import { cleanDisplay, shortLocation } from "./journey";
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
  const { snapshot, error, clearError, connected, command, newIds } =
    useWorkspace();
  const [search, setSearch] = useState(""),
    [sourceInfo, setSourceInfo] = useState(false),
    [visible, setVisible] = useState(!document.hidden);
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
  const matches = useMemo(
    () =>
      applications.filter(
        (a) =>
          `${a.company} ${a.title} ${a.location}`
            .toLowerCase()
            .includes(search.toLowerCase().trim()) &&
          (!v || v.status === "all" || v.status === a.status) &&
          (!v?.flowIds || v.flowIds.includes(a.id)) &&
          (!v?.city ||
            geographicGroups(applications)
              .find((g) => g.id === v.city)
              ?.ids.includes(a.id)),
      ),
    [applications, search, v?.status, v?.flowIds, v?.city],
  );
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
          career<span>flow</span>
        </span>
        <p>{error || "Opening your local workspace…"}</p>
        {error && <button onClick={() => location.reload()}>Reconnect</button>}
      </main>
    );
  const selected = applications.find((a) => a.id === v.selectedId),
    evidence = selected?.evidence.find((e) => e.id === v.evidenceId),
    moving = v.motion && !reduced && visible;
  const cityGroups = geographicGroups(applications);
  const geography = v.city
    ? cityGroups.find((g) => g.id === v.city)
    : undefined;
  const visibleApplications = geography
    ? applications.filter((a) => geography.ids.includes(a.id))
    : applications;
  async function goCity(city: import("../shared/model").Theme, ids: string[]) {
    await command("location", { city });
  }
  const asOf = applications.reduce(
    (day, a) => (a.asOf > day ? a.asOf : day),
    "",
  );
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
      <main id="scene-workspace">
        <header className="scene-header">
          <div className="heading">
            <span className="wordmark">
              career<span>flow</span>
              <i />
            </span>
            <h1>
              Your search, <em>in motion.</em>
            </h1>
            <p>Real applications. Recorded journeys.</p>
          </div>
          <div className="top-controls">
            <button
              className="search-trigger"
              onClick={() => void command("list", { enabled: true })}
            >
              <svg
                viewBox="0 0 24 24"
                width="17"
                height="17"
                aria-hidden="true"
              >
                <circle cx="10" cy="10" r="6" />
                <path d="m15 15 6 6" />
              </svg>
              <span>Find an application</span>
              <kbd>⌘ K</kbd>
            </button>
          </div>
        </header>
        <div className="scene-utility">
          <div className="navigation">
            {(v.theme !== "neutral" || v.city !== null) && (
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
          <div className="scene-location">
            <label htmlFor="location-scene">Background</label>
            <select
              id="location-scene"
              value={v.theme}
              onChange={(e) => void command("theme", { theme: e.target.value })}
              title="Background only. Selecting an application follows its location."
            >
              <option value="neutral">Overview</option>
              {availableScenes(applications).map((id) => (
                <option key={id} value={id}>
                  {themeLabels[id]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && (
          <div className="error-toast" role="alert">
            {error}
            <button onClick={clearError}>Dismiss</button>
          </div>
        )}
        <div className="geography-controls">
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
          ) : (
            <>
              <span>
                Drag the globe or use arrow keys to explore locations.
              </span>
              {cityGroups.find((g) => g.id === "remote") && (
                <button
                  onClick={() =>
                    void goCity(
                      "remote",
                      cityGroups.find((g) => g.id === "remote")!.ids,
                    )
                  }
                >
                  Remote · anywhere ·{" "}
                  {cityGroups.find((g) => g.id === "remote")!.ids.length}
                </button>
              )}
            </>
          )}
        </div>
        <JourneyScene
          background={
            <Atmosphere
              theme={v.theme}
              moving={moving}
              home={snapshot.homeLocation}
              applications={applications}
              onCity={goCity}
            />
          }
          applications={visibleApplications}
          view={v}
          moving={moving}
          newIds={newIds}
          onSelect={(id) => void select(id)}
          onGroup={(ids) => void command("flow", { ids })}
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
              <strong>{applications.length} applications</strong>
              <span>
                {asOf
                  ? `Evidence through ${formatDate(asOf)}`
                  : "No imported records"}
              </span>
            </div>
          </div>
          <div className="scene-legend">
            <span>
              <i /> Dots are applications
            </span>
            <span>Light follows recorded paths, not future progress.</span>
          </div>
          <button
            className={`sync-status ${connected ? "connected" : ""}`}
            onClick={() => setSourceInfo(true)}
          >
            <i />
            <span>
              {!connected
                ? "Reconnecting"
                : snapshot.sync.enabled
                  ? snapshot.sync.state === "error"
                    ? "Source needs attention"
                    : "Watching application list"
                  : "Saved on this device"}
              <small>
                {snapshot.sync.enabled
                  ? "Checks every 2 seconds"
                  : "Local workspace"}
              </small>
            </span>
          </button>
        </div>
        <p className="mobile-hint">
          Pan the scene to follow a path, or use Find an application.
        </p>
      </main>
      {sourceInfo ? (
        <Popup title="Source updates" onClose={() => setSourceInfo(false)}>
          <div className="popup-body source-info">
            <h2>
              {snapshot.sync.enabled
                ? "Watching your application list"
                : "Local workspace"}
            </h2>
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
            <p>
              Updates preserve your selection and open document. Historical
              reconciliation is a separate step.
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
                  {matches.map((a) => (
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
  return (
    <div className="popup-body application-card">
      <span className="eyebrow">{shortLocation(a.location)}</span>
      <h2>{a.company}</h2>
      <p className="role-title">{cleanDisplay(a.title)}</p>
      <span className={`status-label ${a.status}`}>
        {statusLabels[a.status]}
      </span>
      <div className="document-shortcuts">
        {docs.map((e) => (
          <button key={e.id} onClick={() => onDocument(e.id)}>
            {e.kind === "resume" ? "Resume" : "Employer feedback"} ↗
          </button>
        ))}
      </div>
      <ol className="timeline">
        {a.events.map((e) => (
          <li key={e.id}>
            <time>{formatDate(e.date)}</time>
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
