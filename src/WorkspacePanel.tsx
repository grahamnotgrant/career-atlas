import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Snapshot } from "../shared/model";
import { isQueued, type CareerSettings } from "../shared/career";
import {
  initialWorkspaceState,
  type AgentRun,
  type WorkspaceQuestion,
  type WorkFact,
  type AttemptMaterial,
} from "../shared/workspace";
import { useNow } from "./useNow";
import "./workspace.css";

type Navigate = "queue" | "roles" | "records" | "analysis" | "journey";
type SendCommand = (
  action: string,
  payload: Record<string, unknown>,
) => Promise<unknown>;
export interface WorkspacePanelProps {
  snapshot: Snapshot;
  connected: boolean;
  workspaceCommand: SendCommand;
  careerCommand: SendCommand;
  onNavigate: (tab: Navigate) => void;
  pendingWorkspaceCommand?: {
    id: string;
    action: string;
    payload?: Record<string, unknown>;
  } | null;
  retryPendingWorkspaceCommand?: () => Promise<boolean>;
}
const dateLabel = (value: string | null) => {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};
const readable = (text: string) => text.replaceAll("-", " ");
const shortScope = (text: string) =>
  text.length > 48 ? `${text.slice(0, 47)}…` : text;
function Reference({ label, reference }: { label: string; reference: string }) {
  let href: string | undefined;
  try {
    const parsed = new URL(reference);
    if (["https:", "http:"].includes(parsed.protocol)) href = parsed.href;
  } catch {
    if (/^\/api\/evidence\/[a-zA-Z0-9_-]+\/file$/.test(reference))
      href = reference;
  }
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  ) : (
    <span>
      {label}
      {reference && reference !== label && (
        <>
          : <code>{reference}</code>
        </>
      )}
    </span>
  );
}
function Support({ items }: { items: { label: string; reference: string }[] }) {
  if (!items.length) return null;
  return (
    <ul className="workspace-support">
      {items.map((s, i) => (
        <li key={`${s.reference}-${i}`}>
          <Reference {...s} />
        </li>
      ))}
    </ul>
  );
}
function QuestionInventory({
  questions,
}: {
  questions: AttemptMaterial["questions"];
}) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(12);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Exact questions and answers ({questions.length})</summary>
      {open && (
        <>
          <ul className="workspace-rows">
            {questions.slice(0, limit).map((answer, i) => (
              <li key={i}>
                <h3>{answer.prompt}</h3>
                <span className="workspace-status">
                  {readable(answer.status)}
                </span>
                <p className="workspace-preserve-text">
                  {answer.answer ||
                    (answer.status === "blank"
                      ? "Intentionally blank"
                      : answer.status === "declined"
                        ? "No response provided"
                        : "No answer text captured")}
                </p>
              </li>
            ))}
          </ul>
          {questions.length > limit && (
            <button
              className="workspace-secondary"
              onClick={() => setLimit(limit + 12)}
            >
              Show more answers
            </button>
          )}
        </>
      )}
    </details>
  );
}
function runState(run: AgentRun, now: number) {
  if (run.status !== "running")
    return {
      label: readable(run.status),
      tone: run.status === "complete" ? "good" : "attention",
    };
  if (!run.heartbeatAt)
    return { label: "No check-in recorded", tone: "attention" };
  const heartbeat = Date.parse(run.heartbeatAt);
  if (heartbeat > now + 60_000)
    return { label: "Check-in time needs review", tone: "attention" };
  if (now - heartbeat > 120_000)
    return { label: "Check-in overdue", tone: "attention" };
  return { label: "Working", tone: "good" };
}
type QuestionDraft = { answer: string; reviewedAt: string };
function QuestionForm({
  question,
  disabled,
  send,
  draft,
  onDraft,
  onSaved,
}: {
  question: WorkspaceQuestion;
  disabled: boolean;
  send: (
    action: string,
    payload: Record<string, unknown>,
    success: string,
  ) => Promise<boolean>;
  draft: QuestionDraft | undefined;
  onDraft: (draft: QuestionDraft) => void;
  onSaved: (draft: QuestionDraft) => void;
}) {
  const answer = draft?.answer ?? "";
  const reviewedAt = draft?.reviewedAt ?? question.updatedAt;
  const changed = reviewedAt !== question.updatedAt;
  const update = (value: string) => {
    onDraft({ answer: value, reviewedAt });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled || changed || !answer.trim() || !draft) return;
    const submittedDraft = draft;
    if (
      await send(
        "answer",
        { id: question.id, answer: answer.trim() },
        "Answer saved. Your agent can continue from this decision.",
      )
    )
      onSaved(submittedDraft);
  };
  return (
    <>
      <h2 id="workspace-question" tabIndex={-1}>
        {question.prompt}
      </h2>
      {question.recordIds.length > 0 && (
        <p>
          {question.recordIds.length} linked{" "}
          {question.recordIds.length === 1 ? "record" : "records"} waiting on
          this answer.
        </p>
      )}
      <Support items={question.support} />
      {changed && (
        <div className="workspace-notice" data-error="true" role="alert">
          The question changed while you were answering. Review it before
          saving.
          <div className="workspace-inline-actions">
            <button
              type="button"
              onClick={() =>
                onDraft({ answer, reviewedAt: question.updatedAt })
              }
            >
              I’ve reviewed the updated question
            </button>
          </div>
        </div>
      )}
      <form onSubmit={submit}>
        <label htmlFor="workspace-answer">Your answer</label>
        {question.kind === "choice" ? (
          <select
            id="workspace-answer"
            value={answer}
            onChange={(e) => update(e.target.value)}
            required
          >
            <option value="">Choose an answer</option>
            {question.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <textarea
            id="workspace-answer"
            value={answer}
            onChange={(e) => update(e.target.value)}
            maxLength={20000}
            required
            rows={3}
          />
        )}
        <div className="workspace-form-actions">
          <button
            className="workspace-primary"
            type="submit"
            disabled={disabled || changed || !answer.trim()}
          >
            Save answer
          </button>
          <p>Saving an answer does not approve new application wording.</p>
        </div>
      </form>
    </>
  );
}
function Preferences({
  settings,
  revision,
  disabled,
  save,
}: {
  settings: CareerSettings;
  revision: number;
  disabled: boolean;
  save: (settings: CareerSettings) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(settings);
  const [draftRevision, setDraftRevision] = useState(revision);
  const [dirty, setDirty] = useState(false);
  const editVersion = useRef(0);
  const stale = draftRevision !== revision;
  useEffect(() => {
    if (!dirty) {
      setDraft(settings);
      setDraftRevision(revision);
    }
  }, [settings, revision, dirty]);
  const reset = () => {
    editVersion.current += 1;
    setDraft(settings);
    setDraftRevision(revision);
    setDirty(false);
  };
  const update = (patch: Partial<CareerSettings>) => {
    editVersion.current += 1;
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };
  return (
    <form
      data-workspace-dirty={dirty ? "true" : undefined}
      onSubmit={async (e) => {
        e.preventDefault();
        if (stale || disabled) return;
        const submittedVersion = editVersion.current;
        const submittedRevision = draftRevision;
        if (await save(draft)) {
          setDraftRevision(submittedRevision + 1);
          if (editVersion.current === submittedVersion) setDirty(false);
        }
      }}
    >
      <p className="workspace-copy">
        These preferences guide fit. They do not expand application
        authorization.
      </p>
      {stale && (
        <div className="workspace-notice" data-error="true">
          <p>
            Records changed while this form was open. Reload the current
            preferences before editing.
          </p>
          <button type="button" onClick={reset}>
            Reload preferences
          </button>
        </div>
      )}
      <div className="workspace-form-grid">
        <div>
          <label htmlFor="workspace-goals">What you want next</label>
          <textarea
            id="workspace-goals"
            value={draft.goals}
            maxLength={100000}
            onChange={(e) => update({ goals: e.target.value })}
            rows={3}
          />
        </div>
        <div>
          <label htmlFor="workspace-locations">Locations, one per line</label>
          <textarea
            id="workspace-locations"
            value={draft.locations.join("\n")}
            onChange={(e) => update({ locations: e.target.value.split("\n") })}
            rows={3}
          />
        </div>
        <div>
          <label htmlFor="workspace-exclusions">
            Roles or work to exclude, one per line
          </label>
          <textarea
            id="workspace-exclusions"
            value={draft.exclusions.join("\n")}
            onChange={(e) => update({ exclusions: e.target.value.split("\n") })}
            rows={3}
          />
        </div>
        <fieldset className="workspace-arrangements">
          <legend>Work arrangements</legend>
          <div className="workspace-inline-actions">
            {(["remote", "hybrid", "onsite"] as const).map((value) => (
              <label className="workspace-check" key={value}>
                <input
                  type="checkbox"
                  checked={draft.workArrangements.includes(value)}
                  onChange={(e) =>
                    update({
                      workArrangements: e.target.checked
                        ? [...draft.workArrangements, value]
                        : draft.workArrangements.filter((v) => v !== value),
                    })
                  }
                />
                {value === "onsite"
                  ? "On site"
                  : value[0].toUpperCase() + value.slice(1)}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <button
        className="workspace-primary"
        disabled={disabled || stale || !dirty}
        type="submit"
      >
        Save preferences
      </button>
    </form>
  );
}
export function WorkspacePanel({
  snapshot,
  connected,
  workspaceCommand,
  careerCommand,
  onNavigate,
  pendingWorkspaceCommand,
  retryPendingWorkspaceCommand,
}: WorkspacePanelProps) {
  const state = snapshot.workspace ?? initialWorkspaceState;
  const { career } = snapshot;
  const now = useNow([
    ...state.runs.flatMap((run) =>
      run.heartbeatAt
        ? [new Date(Date.parse(run.heartbeatAt) + 120_001).toISOString()]
        : [],
    ),
    ...career.grants.map((g) => g.expiresAt),
  ]);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [careerBusy, setCareerBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [instruction, setInstruction] = useState("");
  const instructionVersion = useRef(0);
  const [questionDrafts, setQuestionDrafts] = useState<
    Record<string, QuestionDraft>
  >({});
  const [targetRun, setTargetRun] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [factLimit, setFactLimit] = useState(8);
  const [materialLimit, setMaterialLimit] = useState(8);
  const [sourceLimit, setSourceLimit] = useState(8);
  const [activityLimit, setActivityLimit] = useState(6);
  const [questionLimit, setQuestionLimit] = useState(12);
  const [templateLimit, setTemplateLimit] = useState(8);
  const [grantLimit, setGrantLimit] = useState(3);
  const [deliveryLimit, setDeliveryLimit] = useState(4);
  const questions = state.questions
    .filter((q) => q.status === "open")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const question =
    questions.find((q) => q.id === selectedQuestion) ?? questions[0];
  const previousQuestion = useRef({
    id: question?.id,
    selected: selectedQuestion,
  });
  useEffect(() => {
    const previous = previousQuestion.current;
    previousQuestion.current = {
      id: question?.id,
      selected: selectedQuestion,
    };
    const selectedAnother = selectedQuestion !== previous.selected;
    const advanced = !!previous.id && question?.id !== previous.id;
    const focusWasRemoved = document.activeElement === document.body;
    if (question && (selectedAnother || (advanced && focusWasRemoved)))
      document.getElementById("workspace-question")?.focus();
  }, [selectedQuestion, question?.id]);
  const runs = [...state.runs].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const activeRuns = runs.filter(
    (r) => !["complete", "cancelled"].includes(r.status),
  );
  const targetRunUnavailable =
    !!targetRun && !activeRuns.some((run) => run.id === targetRun);
  const deliveries = [...state.steering].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const queueCount = career.opportunities.filter(isQueued).length;
  const applicationIds = new Set(
    snapshot.applications.map((application) => application.id),
  );
  const opportunityApplications = new Map(
    career.opportunities.map((opportunity) => [
      opportunity.id,
      opportunity.applicationId,
    ]),
  );
  const materialApplications = new Set(
    state.materials
      .map(
        (material) =>
          material.applicationId ??
          (material.opportunityId
            ? opportunityApplications.get(material.opportunityId)
            : null),
      )
      .filter((id): id is string => !!id && applicationIds.has(id)),
  );
  const resumeEvidenceCount = snapshot.applications.filter((application) =>
    application.evidence.some((evidence) => evidence.kind === "resume"),
  ).length;
  const preparedReferenceCount = career.opportunities.filter(
    (opportunity) =>
      opportunity.templateId ||
      opportunity.materialHashes.length ||
      opportunity.answers.trim(),
  ).length;
  const grants = [...career.grants].sort(
    (a, b) =>
      Number(a.state === "revoked" || Date.parse(a.expiresAt) <= now) -
      Number(b.state === "revoked" || Date.parse(b.expiresAt) <= now),
  );
  const disabled =
    workspaceBusy || careerBusy || !!pendingWorkspaceCommand || !connected;
  const authorityDisabled = careerBusy || !connected;
  const questionDirty = Object.values(questionDrafts).some(
    (draft) => !!draft.answer,
  );
  const retainedDrafts = Object.entries(questionDrafts).filter(
    ([id, draft]) => draft.answer && !questions.some((q) => q.id === id),
  );
  const perform = async (
    kind: "workspace" | "career",
    command: SendCommand,
    action: string,
    payload: Record<string, unknown>,
    success: string,
  ) => {
    const busy = kind === "workspace" ? workspaceBusy : careerBusy;
    const setBusy = kind === "workspace" ? setWorkspaceBusy : setCareerBusy;
    if (busy) return false;
    setBusy(true);
    setNotice(null);
    try {
      const result = await command(action, payload);
      if (result === false)
        throw new Error(
          "The change was not confirmed. Review the latest state before trying again.",
        );
      setNotice({ text: success, error: false });
      return true;
    } catch (error) {
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : "The change could not be saved. Your text is still here.",
        error: true,
      });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const send = (
    action: string,
    payload: Record<string, unknown>,
    success: string,
  ) => perform("workspace", workspaceCommand, action, payload, success);
  const sendCareer = (
    action: string,
    payload: Record<string, unknown>,
    success: string,
  ) => perform("career", careerCommand, action, payload, success);
  const approveFact = (fact: WorkFact) =>
    fact.wording &&
    send(
      "approve-fact",
      { id: fact.id, wording: fact.wording },
      "Exact wording approved. Existing application permissions still apply.",
    );
  return (
    <section
      className="workspace-screen"
      role="main"
      aria-labelledby="workspace-title"
      data-workspace-dirty={instruction || questionDirty ? "true" : undefined}
    >
      <header className="workspace-heading">
        <div>
          <p className="workspace-brand">
            career<span>atlas</span>
          </p>
          <h1 id="workspace-title">Your search</h1>
          <p>
            The next decision, the work underway, and the evidence behind it.
          </p>
        </div>
        <span className="workspace-connection" data-connected={connected}>
          <i aria-hidden="true" />
          {connected ? "Workspace connected" : "Reconnecting to workspace"}
        </span>
      </header>
      <nav className="workspace-navigation" aria-label="Search workspace">
        <button onClick={() => onNavigate("queue")}>
          Role queue <strong>{queueCount}</strong>
        </button>
        <button onClick={() => onNavigate("records")}>
          All records <strong>{career.opportunities.length}</strong>
        </button>
        <button onClick={() => onNavigate("roles")}>
          Role families <strong>{career.families.length}</strong>
        </button>
        <button onClick={() => onNavigate("analysis")}>Outcomes</button>
        <button onClick={() => onNavigate("journey")}>
          Explore the journey
        </button>
      </nav>
      {!connected && (
        <div className="workspace-notice" role="status">
          Showing the last received records. Your unsaved text stays here while
          the connection recovers.
        </div>
      )}
      {notice && (
        <div
          className="workspace-notice"
          data-error={notice.error}
          role={notice.error ? "alert" : "status"}
        >
          {notice.text}
        </div>
      )}
      {pendingWorkspaceCommand && (
        <div className="workspace-notice" data-error="true" role="alert">
          <p>
            A change is awaiting confirmation. Retrying checks the same request,
            so it cannot create a duplicate instruction.
          </p>
          {retryPendingWorkspaceCommand && (
            <button
              className="workspace-secondary"
              disabled={workspaceBusy || !connected}
              onClick={async () => {
                const checkedInstructionVersion = instructionVersion.current;
                const checkedQuestionDrafts = questionDrafts;
                setWorkspaceBusy(true);
                try {
                  const ok = await retryPendingWorkspaceCommand();
                  if (ok) {
                    const payload = pendingWorkspaceCommand.payload;
                    if (pendingWorkspaceCommand.action === "steer")
                      setInstruction((current) =>
                        instructionVersion.current ===
                          checkedInstructionVersion &&
                        payload?.instruction === current.trim()
                          ? ""
                          : current,
                      );
                    if (
                      pendingWorkspaceCommand.action === "answer" &&
                      typeof payload?.id === "string"
                    ) {
                      const id = payload.id;
                      setQuestionDrafts((old) =>
                        old[id] === checkedQuestionDrafts[id] &&
                        old[id]?.answer.trim() === payload.answer
                          ? { ...old, [id]: { ...old[id], answer: "" } }
                          : old,
                      );
                    }
                  }
                  setNotice({
                    text: ok
                      ? "The saved change is confirmed."
                      : "Confirmation is still unavailable. Keep this workspace open and retry after reconnecting.",
                    error: !ok,
                  });
                } catch {
                  setNotice({
                    text: "Confirmation is still unavailable. Your saved request is retained.",
                    error: true,
                  });
                } finally {
                  setWorkspaceBusy(false);
                }
              }}
            >
              Check saved change
            </button>
          )}
        </div>
      )}
      <div className="workspace-columns">
        <div className="workspace-main">
          <section
            className="workspace-next"
            data-has-question={!!question}
            aria-labelledby={
              question ? "workspace-question" : "workspace-no-question"
            }
          >
            <span className="workspace-section-label">
              {questions.length
                ? `Needs you${questions.length > 1 ? ` · ${questions.length} questions` : ""}`
                : "Your next decision"}
            </span>
            {question ? (
              <QuestionForm
                key={question.id}
                question={question}
                disabled={disabled}
                send={send}
                draft={questionDrafts[question.id]}
                onDraft={(draft) =>
                  setQuestionDrafts((old) => ({ ...old, [question.id]: draft }))
                }
                onSaved={(submittedDraft) =>
                  setQuestionDrafts((old) =>
                    old[question.id] === submittedDraft
                      ? {
                          ...old,
                          [question.id]: { ...submittedDraft, answer: "" },
                        }
                      : old,
                  )
                }
              />
            ) : (
              <>
                <h2 id="workspace-no-question">
                  {state.questions.length
                    ? "No questions waiting"
                    : "No questions recorded in this workspace"}
                </h2>
                <p>
                  Your agent can bring the next decision here. Give it direction
                  below, or review the roles already in your queue.
                </p>
                <div className="workspace-form-actions">
                  <button
                    className="workspace-secondary"
                    onClick={() => onNavigate("queue")}
                  >
                    Review role queue
                  </button>
                </div>
              </>
            )}
            {questions.length > 1 && (
              <details>
                <summary>Other questions ({questions.length - 1})</summary>
                <ul className="workspace-question-list">
                  {questions
                    .filter((q) => q.id !== question?.id)
                    .slice(0, questionLimit)
                    .map((q) => (
                      <li key={q.id}>
                        <button onClick={() => setSelectedQuestion(q.id)}>
                          {q.prompt}
                        </button>
                      </li>
                    ))}
                </ul>
                {questions.length > questionLimit + 1 && (
                  <button onClick={() => setQuestionLimit(questionLimit + 12)}>
                    Show more questions
                  </button>
                )}
              </details>
            )}
            {retainedDrafts.length > 0 && (
              <details>
                <summary>Retained drafts ({retainedDrafts.length})</summary>
                <p>
                  These questions were resolved while you were editing. Your
                  unsaved answers are preserved here.
                </p>
                <ul className="workspace-rows">
                  {retainedDrafts.map(([id, draft]) => (
                    <li key={id}>
                      <h3>
                        {state.questions.find((q) => q.id === id)?.prompt ?? id}
                      </h3>
                      <p className="workspace-preserve-text">{draft.answer}</p>
                      <button
                        onClick={() =>
                          setQuestionDrafts((old) => {
                            const next = { ...old };
                            delete next[id];
                            return next;
                          })
                        }
                      >
                        Discard this draft
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
          <section
            className="workspace-composer"
            aria-labelledby="workspace-direct-title"
          >
            <h2 id="workspace-direct-title">Guide your agent</h2>
            <p>
              Give direction here or in your agent conversation. Instructions
              saved here wait for your agent to collect them.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!instruction.trim() || disabled || targetRunUnavailable)
                  return;
                const submittedVersion = instructionVersion.current;
                const ok = await send(
                  "steer",
                  {
                    instruction: instruction.trim(),
                    ...(targetRun ? { runId: targetRun } : {}),
                  },
                  "Instruction saved and waiting for your agent. This does not mean the work has started.",
                );
                if (ok)
                  setInstruction((current) =>
                    instructionVersion.current === submittedVersion
                      ? ""
                      : current,
                  );
              }}
            >
              <label htmlFor="workspace-instruction">
                What should happen next?
              </label>
              <textarea
                id="workspace-instruction"
                value={instruction}
                onChange={(e) => {
                  instructionVersion.current += 1;
                  setInstruction(e.target.value);
                }}
                required
                maxLength={10000}
                rows={3}
                placeholder="For example: focus on junior roles, review my portfolio, or explain why this role fits."
              />
              {(activeRuns.length > 0 || targetRun) && (
                <>
                  <label htmlFor="workspace-run-target">Direct this work</label>
                  <select
                    id="workspace-run-target"
                    value={targetRun}
                    onChange={(e) => setTargetRun(e.target.value)}
                  >
                    <option value="">The search overall</option>
                    {targetRunUnavailable && (
                      <option value={targetRun}>
                        {runs.find((run) => run.id === targetRun)?.label ??
                          targetRun}{" "}
                        · no longer active
                      </option>
                    )}
                    {activeRuns.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {targetRunUnavailable && (
                <p role="status">
                  The selected work is no longer active. Review and choose a
                  target before saving this instruction.
                </p>
              )}
              <div className="workspace-form-actions">
                <button
                  type="submit"
                  className="workspace-primary"
                  disabled={
                    disabled || !instruction.trim() || targetRunUnavailable
                  }
                >
                  Save instruction
                </button>
              </div>
            </form>
            {deliveries.length > 0 && (
              <ul className="workspace-deliveries">
                {deliveries.slice(0, deliveryLimit).map((item) => (
                  <li key={item.id}>
                    <span
                      className="workspace-status"
                      data-tone={
                        item.status === "pending" || item.status === "failed"
                          ? "attention"
                          : "good"
                      }
                    >
                      {item.status === "pending"
                        ? "Waiting for agent pickup"
                        : item.status === "acknowledged"
                          ? "Agent acknowledged"
                          : readable(item.status)}
                    </span>
                    <p>{item.instruction}</p>
                    {item.message && <p>{item.message}</p>}
                    <span className="workspace-meta">
                      {dateLabel(item.updatedAt)}
                      {item.status === "acknowledged" &&
                        " · Acknowledged does not mean completed"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {deliveries.length > deliveryLimit && (
              <button
                className="workspace-secondary"
                onClick={() => setDeliveryLimit(deliveryLimit + 12)}
              >
                Show earlier instructions
              </button>
            )}
          </section>
          <section aria-labelledby="workspace-evidence-title">
            <div className="workspace-section-top">
              <h2 id="workspace-evidence-title">Your work & materials</h2>
              <span>
                {state.facts.length} evidence{" "}
                {state.facts.length === 1 ? "record" : "records"} ·{" "}
                {state.materials.length} application{" "}
                {state.materials.length === 1 ? "material" : "materials"}
              </span>
            </div>
            <p className="workspace-copy">
              Keep your contribution, approved wording, and the exact material
              used in each application connected to its source.
            </p>
            <p className="workspace-copy workspace-material-coverage">
              Structured material records: {materialApplications.size} of{" "}
              {snapshot.applications.length} confirmed applications. Existing
              resume evidence: {resumeEvidenceCount} application{" "}
              {resumeEvidenceCount === 1 ? "record" : "records"}. Preparation
              references: {preparedReferenceCount}{" "}
              {preparedReferenceCount === 1 ? "opportunity" : "opportunities"}.
              An incomplete structured inventory does not establish a missing
              resume.
            </p>
            <button
              className="workspace-secondary"
              onClick={() => onNavigate("records")}
            >
              Inspect existing application documents
            </button>
            <details>
              <summary>Work evidence ({state.facts.length})</summary>
              {!state.facts.length ? (
                <p>
                  Ask your agent to review relevant projects, employment,
                  coursework, volunteering or portfolio work. Only authorized
                  sources should be checked.
                </p>
              ) : (
                <ul className="workspace-rows">
                  {state.facts.slice(0, factLimit).map((fact) => (
                    <li key={fact.id}>
                      <h3>{fact.label}</h3>
                      <p>{fact.observation}</p>
                      <dl>
                        <dt>Your contribution</dt>
                        <dd>{fact.contribution || "Needs clarification"}</dd>
                        <dt>Ownership</dt>
                        <dd>{readable(fact.ownership)}</dd>
                        <dt>Observed result</dt>
                        <dd>{fact.outcome}</dd>
                      </dl>
                      <Support items={fact.support} />
                      {fact.wording && (
                        <>
                          <h3>Proposed wording</h3>
                          <p>{fact.wording}</p>
                          {fact.wordingApproval?.text === fact.wording ? (
                            <span className="workspace-status" data-tone="good">
                              Exact wording approved{" "}
                              {dateLabel(fact.wordingApproval.approvedAt)}
                            </span>
                          ) : (
                            <div className="workspace-inline-actions">
                              <button
                                className="workspace-secondary"
                                disabled={
                                  disabled ||
                                  !fact.support.length ||
                                  ["unresolved", "disputed"].includes(
                                    fact.ownership,
                                  )
                                }
                                onClick={() => void approveFact(fact)}
                              >
                                Approve this wording
                              </button>
                              {["unresolved", "disputed"].includes(
                                fact.ownership,
                              ) && (
                                <p>
                                  Clarify personal contribution with your agent
                                  before approving wording.
                                </p>
                              )}
                              {!fact.support.length && (
                                <p>
                                  Add a source with your agent before approving
                                  wording.
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {state.facts.length > factLimit && (
                <button
                  className="workspace-secondary"
                  onClick={() => setFactLimit(factLimit + 12)}
                >
                  Show more work evidence
                </button>
              )}
            </details>
            <details>
              <summary>
                Application materials ({state.materials.length})
              </summary>
              {!state.materials.length ? (
                <p>
                  No typed material inventory has been recorded here. Existing
                  application documents remain in All records; missing inventory
                  does not erase a confirmed submission.
                </p>
              ) : (
                <ul className="workspace-rows">
                  {state.materials.slice(0, materialLimit).map((material) => (
                    <li key={material.id}>
                      <div className="workspace-row-title">
                        <h3>{material.label}</h3>
                        <span
                          className="workspace-status"
                          data-tone={
                            material.coverage === "verified"
                              ? "good"
                              : "attention"
                          }
                        >
                          {readable(material.coverage)}
                        </span>
                      </div>
                      <dl>
                        <dt>Material</dt>
                        <dd>
                          {readable(material.role)} · {material.mediaType}
                        </dd>
                        <dt>Application attempt</dt>
                        <dd>{material.attemptKey}</dd>
                        {material.applicationId && (
                          <>
                            <dt>Application</dt>
                            <dd>{material.applicationId}</dd>
                          </>
                        )}
                        {material.opportunityId && (
                          <>
                            <dt>Opportunity</dt>
                            <dd>{material.opportunityId}</dd>
                          </>
                        )}
                        {material.originalId && (
                          <>
                            <dt>Derivative of</dt>
                            <dd>{material.originalId}</dd>
                          </>
                        )}
                        {material.sha256 && (
                          <>
                            <dt>File identity</dt>
                            <dd>
                              <code>{material.sha256}</code>
                            </dd>
                          </>
                        )}
                        {material.reference && (
                          <>
                            <dt>Original reference</dt>
                            <dd>
                              <Reference
                                label="Material source"
                                reference={material.reference}
                              />
                            </dd>
                          </>
                        )}
                      </dl>
                      <Support items={material.support} />
                      {material.questions.length > 0 && (
                        <QuestionInventory questions={material.questions} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {state.materials.length > materialLimit && (
                <button
                  className="workspace-secondary"
                  onClick={() => setMaterialLimit(materialLimit + 12)}
                >
                  Show more materials
                </button>
              )}
            </details>
            <details>
              <summary>
                Resume and application templates ({career.templates.length})
              </summary>
              {career.templates.length ? (
                <ul className="workspace-rows">
                  {career.templates.slice(0, templateLimit).map((template) => (
                    <li key={template.id}>
                      <h3>
                        {career.families.find((f) => f.id === template.familyId)
                          ?.name ?? template.familyId}{" "}
                        · version {template.version}
                      </h3>
                      <details>
                        <summary>Review exact template</summary>
                        <p className="workspace-preserve-text">
                          {template.content}
                        </p>
                        {template.claims.length > 0 && (
                          <ul className="workspace-support">
                            {template.claims.map((claim, i) => (
                              <li key={i}>{claim}</li>
                            ))}
                          </ul>
                        )}
                        {template.approvedAt ? (
                          <span className="workspace-status" data-tone="good">
                            Approved {dateLabel(template.approvedAt)}
                          </span>
                        ) : (
                          <div className="workspace-inline-actions">
                            <button
                              className="workspace-secondary"
                              disabled={disabled}
                              onClick={() =>
                                void sendCareer(
                                  "approve-template",
                                  {
                                    id: template.id,
                                    approvalNote: `Approved exact template ${template.id}, version ${template.version}, in Career Atlas.`,
                                  },
                                  "Exact template approved. Application grant boundaries still apply.",
                                )
                              }
                            >
                              Approve this template
                            </button>
                          </div>
                        )}
                      </details>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  Your agent will bring exact template wording here for
                  approval.
                </p>
              )}
              {career.templates.length > templateLimit && (
                <button
                  className="workspace-secondary"
                  onClick={() => setTemplateLimit(templateLimit + 12)}
                >
                  Show more templates
                </button>
              )}
            </details>
          </section>
        </div>
        <aside
          className="workspace-rail"
          aria-label="Agent progress and search controls"
        >
          <section aria-labelledby="workspace-activity-title">
            <div className="workspace-section-top">
              <h2 id="workspace-activity-title">Agent activity</h2>
              <span>{activeRuns.length} unfinished</span>
            </div>
            {runs.length ? (
              <ul className="workspace-activity">
                {runs.slice(0, activityLimit).map((run) => {
                  const status = runState(run, now);
                  return (
                    <li key={run.id} data-status={run.status}>
                      <h3>{run.label}</h3>
                      <p>{run.phase || readable(run.operation)}</p>
                      <span
                        className="workspace-status"
                        data-tone={status.tone}
                      >
                        {status.label}
                      </span>
                      <span className="workspace-meta">
                        Last check-in: {dateLabel(run.heartbeatAt)}
                      </span>
                      {run.nextAction && <p>Next: {run.nextAction}</p>}
                      {run.outputs.length > 0 && (
                        <details>
                          <summary>
                            Work recorded ({run.outputs.length})
                          </summary>
                          <ul className="workspace-support">
                            {run.outputs.map((reference, i) => (
                              <li key={i}>
                                <Reference
                                  label={reference}
                                  reference={reference}
                                />
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="workspace-empty">
                No agent has checked in. Ask your agent to start or resume the
                daily flow. A connected app does not mean an agent is running.
              </p>
            )}
            {runs.length > activityLimit && (
              <button
                className="workspace-secondary"
                onClick={() => setActivityLimit(activityLimit + 6)}
              >
                Show earlier activity
              </button>
            )}
          </section>
          <section aria-labelledby="workspace-sources-title">
            <div className="workspace-section-top">
              <h2 id="workspace-sources-title">Source coverage</h2>
              <span>{state.sources.length} recorded</span>
            </div>
            {state.sources.length ? (
              <ul className="workspace-rows">
                {state.sources.slice(0, sourceLimit).map((source) => (
                  <li key={source.id}>
                    <div className="workspace-row-title">
                      <h3>{source.label}</h3>
                      <span
                        className="workspace-status"
                        data-tone={
                          source.coverage === "complete" ? "good" : "attention"
                        }
                      >
                        {source.coverage === "complete"
                          ? "Checked window complete"
                          : readable(source.coverage)}
                      </span>
                    </div>
                    <p>{source.message || source.scope}</p>
                    <span className="workspace-meta">
                      Checked {dateLabel(source.checkedAt)}
                    </span>
                    <details>
                      <summary>Scope and recovery</summary>
                      <dl>
                        <dt>Scope</dt>
                        <dd>{source.scope}</dd>
                        <dt>Checked from</dt>
                        <dd>{dateLabel(source.checkedFrom)}</dd>
                        <dt>Checked through</dt>
                        <dd>{dateLabel(source.checkedThrough)}</dd>
                        <dt>Last successful check</dt>
                        <dd>
                          {dateLabel(source.lastSuccessful?.checkedAt ?? null)}
                        </dd>
                        {source.recoveryAction && (
                          <>
                            <dt>Next recovery step</dt>
                            <dd>{source.recoveryAction}</dd>
                          </>
                        )}
                      </dl>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="workspace-empty">
                Source coverage has not been recorded. The newest application
                date cannot establish when your inbox, files or other sources
                were checked.
              </p>
            )}
            {state.sources.length > sourceLimit && (
              <button
                className="workspace-secondary"
                onClick={() => setSourceLimit(sourceLimit + 12)}
              >
                Show more sources
              </button>
            )}
          </section>
          <section aria-labelledby="workspace-authority-title">
            <h2 id="workspace-authority-title">Application permissions</h2>
            <p className="workspace-copy">
              Your agent may submit eligible roles within an active grant. You
              can pause that authority here.
            </p>
            {career.grants.length ? (
              <ul className="workspace-rows">
                {grants.slice(0, grantLimit).map((grant) => {
                  const expired = Date.parse(grant.expiresAt) <= now;
                  const familyNames = grant.roleFamilyIds.map(
                    (id) =>
                      career.families.find((family) => family.id === id)
                        ?.name ?? id,
                  );
                  const familySummary =
                    familyNames.slice(0, 2).map(shortScope).join(", ") +
                    (familyNames.length > 2
                      ? ` +${familyNames.length - 2} more`
                      : "");
                  return (
                    <li key={grant.id} className="workspace-grant">
                      <div className="workspace-row-title">
                        <h3 className="workspace-grant-title">
                          {familySummary}
                        </h3>
                        <span
                          className="workspace-status"
                          data-tone={
                            grant.state === "active" && !expired
                              ? "good"
                              : "attention"
                          }
                        >
                          {expired && grant.state !== "revoked"
                            ? "Expired"
                            : readable(grant.state)}
                        </span>
                      </div>
                      <p>
                        {shortScope(grant.locations[0])}
                        {grant.locations.length > 1 &&
                          ` +${grant.locations.length - 1} more locations`}
                      </p>
                      <dl>
                        <dt>Minimum annual base</dt>
                        <dd>
                          {grant.currency}{" "}
                          {grant.minAnnualBase.toLocaleString()}
                        </dd>
                        <dt>Application cap</dt>
                        <dd>{grant.maxApplications.toLocaleString()}</dd>
                        {
                          <>
                            <dt>Submission attempts remaining</dt>
                            <dd>
                              {Math.max(
                                0,
                                grant.maxApplications -
                                  (state.grantUsage[grant.id] ?? 0),
                              ).toLocaleString()}{" "}
                              of {grant.maxApplications.toLocaleString()}
                            </dd>
                          </>
                        }
                        <dt>Expires</dt>
                        <dd>{dateLabel(grant.expiresAt)}</dd>
                      </dl>
                      {grant.state !== "revoked" && (
                        <div className="workspace-inline-actions">
                          <button
                            className="workspace-secondary"
                            disabled={authorityDisabled || expired}
                            onClick={() =>
                              void sendCareer(
                                "grant-state",
                                {
                                  id: grant.id,
                                  status:
                                    grant.state === "active"
                                      ? "paused"
                                      : "active",
                                },
                                grant.state === "active"
                                  ? "Application authorization paused. An external form already attempted may still need reconciliation."
                                  : "Application authorization resumed within its existing limits.",
                              )
                            }
                          >
                            {grant.state === "active"
                              ? "Pause applications"
                              : "Resume applications"}
                          </button>
                          <button
                            className="workspace-secondary workspace-danger"
                            disabled={authorityDisabled}
                            onClick={() =>
                              void sendCareer(
                                "grant-state",
                                { id: grant.id, status: "revoked" },
                                "Application authorization revoked. Existing submission evidence is preserved.",
                              )
                            }
                          >
                            Revoke authorization
                          </button>
                        </div>
                      )}
                      <details className="workspace-grant-scope">
                        <summary>Review exact scope</summary>
                        <div
                          className="workspace-grant-scope-body"
                          role="region"
                          aria-label={`Exact authorization scope for ${familySummary}`}
                          tabIndex={0}
                        >
                          <h4>Role families ({familyNames.length})</h4>
                          <ul>
                            {familyNames.map((name, index) => (
                              <li key={grant.roleFamilyIds[index]}>{name}</li>
                            ))}
                          </ul>
                          <h4>Locations ({grant.locations.length})</h4>
                          <ul>
                            {grant.locations.map((location, index) => (
                              <li key={index}>{location}</li>
                            ))}
                          </ul>
                          <h4>Exclusions ({grant.exclusions.length})</h4>
                          {grant.exclusions.length ? (
                            <ul>
                              {grant.exclusions.map((exclusion, index) => (
                                <li key={index}>{exclusion}</li>
                              ))}
                            </ul>
                          ) : (
                            <p>No exclusions in this authorization.</p>
                          )}
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="workspace-empty">
                No application grant has been recorded. Your agent can prepare
                work and discuss a bounded grant with you.
              </p>
            )}
            {grants.length > grantLimit && (
              <button
                className="workspace-secondary"
                onClick={() => setGrantLimit(grantLimit + 12)}
              >
                Show more authorizations
              </button>
            )}
          </section>
          <section aria-labelledby="workspace-export-title">
            <div className="workspace-section-top">
              <h2 id="workspace-export-title">Spreadsheet</h2>
              <span
                className="workspace-status"
                data-tone={
                  state.exportHealth.state === "current" ? "good" : "attention"
                }
              >
                {readable(state.exportHealth.state)}
              </span>
            </div>
            <p className="workspace-copy">{state.exportHealth.message}</p>
            <span className="workspace-meta">
              Last export: {dateLabel(state.exportHealth.exportedAt)}
            </span>
            {state.exportHealth.path && (
              <details>
                <summary>Export details</summary>
                <dl>
                  <dt>Saved file</dt>
                  <dd>
                    <code>{state.exportHealth.path}</code>
                  </dd>
                  <dt>Data generation</dt>
                  <dd>{state.exportHealth.generation ?? "Unknown"}</dd>
                  <dt>Career revision</dt>
                  <dd>{state.exportHealth.careerRevision ?? "Unknown"}</dd>
                  <dt>Workspace revision</dt>
                  <dd>{state.exportHealth.workspaceRevision ?? "Unknown"}</dd>
                </dl>
              </details>
            )}
          </section>
          <section>
            <details>
              <summary>Search preferences</summary>
              <Preferences
                key={snapshot.workspaceId}
                settings={career.settings}
                revision={career.revision}
                disabled={disabled}
                save={(settings) =>
                  sendCareer(
                    "settings",
                    {
                      settings: {
                        ...settings,
                        locations: settings.locations
                          .map((s) => s.trim())
                          .filter(Boolean),
                        exclusions: settings.exclusions
                          .map((s) => s.trim())
                          .filter(Boolean),
                      },
                    },
                    "Search preferences saved. Existing grant limits remain in force.",
                  )
                }
              />
            </details>
          </section>
        </aside>
      </div>
    </section>
  );
}
