import { useState } from "react";
import type { Application } from "../shared/model";
import { outcomeLabels, stageLabels, statusLabels } from "../shared/model";
import { sceneCatalog } from "../shared/locations";
import {
  ageBuckets,
  currentStage,
  daysSilent,
  daysToOutcome,
  formatRate,
  isStale,
  lastStage,
  median,
  outcomeBreakdown,
  placeConversion,
  placeCounts,
  remoteRestriction,
  selectionMembers,
  stageStats,
  STALE_DAYS,
  type Selection,
} from "./journey";

const LISTED = 6;
interface Place {
  id: string;
  label: string;
  ids: string[];
}
export function StagePanel({
  selection,
  applications,
  places,
  color,
  onSelect,
  onPlace,
  onEmphasis,
  onClose,
  onCloseSilent,
}: {
  selection: Selection;
  applications: Application[];
  places: Place[];
  color: string;
  onSelect: (id: string) => void;
  onPlace: (id: string) => void;
  onEmphasis: (id: string | null) => void;
  onClose: () => void;
  /** The user's own decision to close applications nobody replied to. */
  onCloseSilent: (ids: string[]) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const stage =
    selection.kind === "stage" ? stageStats(applications, selection.id) : null;
  const members = selectionMembers(applications, selection);
  const byId = new Map(members.map((a) => [a.id, a]));
  const groups = placeCounts(places, new Set(byId.keys()));
  const rates = new Map(
    placeConversion(places, applications).map((row) => [row.id, row]),
  );
  const placed = new Set(groups.flatMap((g) => g.members));
  const unplaced = members.filter((a) => !placed.has(a.id));
  const label =
    selection.kind === "stage"
      ? stageLabels[selection.id]
      : outcomeLabels[selection.id];
  /* Waiting applies to anyone still open; time to outcome to anyone decided. */
  const waiting = members.filter(
    (a) => a.status === "pending" || a.status === "interview",
  );
  const silent = waiting
    .map((a) => daysSilent(a))
    .filter((d): d is number => d !== null);
  const decided = members
    .map(daysToOutcome)
    .filter((d): d is number => d !== null);
  const stale = waiting.filter((a) => isStale(a)).length;
  const note = (a: Application) => {
    const parts = [statusLabels[a.status]];
    if (currentStage(a)) parts.push(stageLabels[currentStage(a)!]);
    const tied = remoteRestriction(a);
    if (tied) parts.push(`Remote, tied to ${sceneCatalog[tied].label}`);
    const quiet = daysSilent(a);
    if (a.status === "pending" || a.status === "interview") {
      if (quiet !== null)
        parts.push(
          quiet >= STALE_DAYS ? `silent ${quiet} days` : `${quiet} days ago`,
        );
    } else {
      const took = daysToOutcome(a);
      if (took !== null) parts.push(`decided in ${took} days`);
    }
    return parts.join(" · ");
  };
  const companies = (key: string, apps: Application[]) => {
    const open = expanded.has(key);
    const shown = open ? apps : apps.slice(0, LISTED);
    return (
      <div className="stage-companies">
        {shown.map((a) => (
          <button
            key={a.id}
            aria-label={`Inspect ${a.company}: ${a.title}`}
            data-stale={isStale(a) ? "true" : undefined}
            onClick={() => onSelect(a.id)}
            onMouseEnter={() => onEmphasis(a.id)}
            onMouseLeave={() => onEmphasis(null)}
            onFocus={() => onEmphasis(a.id)}
            onBlur={() => onEmphasis(null)}
          >
            {a.company}
            <small>{note(a)}</small>
          </button>
        ))}
        {apps.length > LISTED && (
          <button
            className="panel-link"
            onClick={() =>
              setExpanded((now) => {
                const next = new Set(now);
                if (open) next.delete(key);
                else next.add(key);
                return next;
              })
            }
          >
            {open ? `Show fewer` : `Show all ${apps.length}`}
          </button>
        )}
      </div>
    );
  };
  const distribution = (title: string, days: number[], suffix: string) => {
    const mid = median(days);
    const peak = Math.max(1, ...ageBuckets(days).map((b) => b.count));
    return (
      <section className="stage-time">
        <h3>{title}</h3>
        <p>
          Median {mid} days{suffix}
        </p>
        <dl>
          {ageBuckets(days).map((bucket) => (
            <div key={bucket.label}>
              <dt>{bucket.label}</dt>
              <dd>
                <i style={{ width: `${(bucket.count / peak) * 100}%` }} />
                {bucket.count}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    );
  };
  return (
    <aside
      className="stage-panel"
      style={{ color }}
      aria-label={`${label} details`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <button className="panel-back quiet-button" onClick={onClose}>
        ← Back to overview
      </button>
      <header>
        <h2>{label}</h2>
        <span className="panel-count" aria-hidden="true">
          {stage ? stage.reached.length : members.length}
        </span>
        {stage ? (
          <p>
            <strong>Currently here · {stage.current.length}</strong>
            <span>{stage.reached.length} reached in total</span>
          </p>
        ) : (
          <p>
            <strong>
              {members.length}{" "}
              {members.length === 1 ? "application" : "applications"}
            </strong>
          </p>
        )}
      </header>
      {!members.length && (
        <p className="panel-empty">
          {stage?.reached.length
            ? "No applications are at this stage now."
            : "No applications here yet."}
        </p>
      )}
      {selection.kind === "outcome" && selection.id === "noreply" ? (
        <div className="panel-stale">
          <p>
            Silent for {STALE_DAYS}+ days since the last contact. The records
            still say awaiting; only you can close them.
          </p>
          {members.length > 0 && (
            <button
              onClick={() => {
                if (
                  confirm(
                    `Close ${members.length} application${members.length === 1 ? "" : "s"} as no reply? This records your decision, dated today, on each one.`,
                  )
                )
                  onCloseSilent(members.map((a) => a.id));
              }}
            >
              Close {members.length} as no reply
            </button>
          )}
        </div>
      ) : (
        stale > 0 && (
          <p className="panel-stale">
            {stale} of {waiting.length} silent for {STALE_DAYS}+ days; they show
            under No reply.
          </p>
        )
      )}
      {members.length > 0 && (
        <section className="stage-current">
          <h3>By location</h3>
          {groups.map((group) => {
            const rate = rates.get(group.id);
            return (
              <details
                key={group.id}
                open={members.length <= 12 || groups.length === 1}
              >
                <summary>
                  {group.label} · {group.members.length}
                  {rate && rate.band !== "few" && (
                    <small data-band={rate.band}>
                      {formatRate(rate.rate)} respond
                    </small>
                  )}
                </summary>
                {companies(
                  group.id,
                  group.members.map((id) => byId.get(id)!),
                )}
                <button
                  className="panel-link"
                  onClick={() => onPlace(group.id)}
                >
                  Open {group.label}
                </button>
              </details>
            );
          })}
          {unplaced.length > 0 && (
            <details open={members.length <= 12}>
              <summary>Location not recorded · {unplaced.length}</summary>
              {companies("unplaced", unplaced)}
            </details>
          )}
        </section>
      )}
      {silent.length > 0 &&
        distribution("Waiting so far", silent, " since the last contact")}
      {decided.length > 0 &&
        distribution("Time to outcome", decided, " from application")}
      {stage && stage.reached.length > 0 && (
        <section className="stage-next">
          <h3>What happened next</h3>
          <dl>
            {[
              ["Still here", stage.current.length],
              ["Moved to a later stage", stage.passed.length],
              [
                "Ended at this stage",
                stage.ended.filter((a) => lastStage(a) === selection.id).length,
              ],
              ["Interview stage unknown", stage.unknown.length],
            ]
              .filter(([, count]) => count)
              .map(([name, count]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{count}</dd>
                </div>
              ))}
          </dl>
        </section>
      )}
      {selection.kind === "outcome" && members.length > 0 && (
        <section className="stage-next">
          <h3>Last confirmed stage</h3>
          <dl>
            {outcomeBreakdown(applications, selection.id).map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.count}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {stage && stage.other.length > 0 && (
        <details className="stage-history">
          <summary>Past applications · {stage.other.length}</summary>
          {companies("past", stage.other)}
        </details>
      )}
    </aside>
  );
}
