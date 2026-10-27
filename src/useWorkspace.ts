import { registerCities } from "../shared/locations";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrivalQueue } from "./arrivalQueue";
import { WorkspaceOutbox } from "./workspaceOutbox";
import {
  workspaceCommandSchema,
  type WorkspaceCommand,
} from "../shared/workspace";
import type { Command, Snapshot } from "../shared/model";
export interface SnapshotVersion {
  workspaceId?: string;
  generation: number;
  view: { revision: number };
  career: { revision: number };
  workspace?: { revision: number };
}
/** Shared acceptance gate for stream events and command readbacks. */
export function shouldAcceptSnapshot(
  previous: SnapshotVersion | null,
  next: SnapshotVersion,
  requestedFrom?: SnapshotVersion | null,
) {
  // An HTTP request issued for an earlier workspace cannot replace the
  // stream's newly loaded workspace, even if the old response arrives later.
  if (
    previous &&
    requestedFrom &&
    previous.workspaceId !== requestedFrom.workspaceId
  )
    return false;
  return (
    !previous ||
    previous.workspaceId !== next.workspaceId ||
    (next.generation >= previous.generation &&
      next.view.revision >= previous.view.revision &&
      next.career.revision >= previous.career.revision &&
      (!previous.workspace || !!next.workspace) &&
      (next.workspace?.revision ?? 0) >= (previous.workspace?.revision ?? 0))
  );
}
async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    ...options,
    signal: options?.signal ?? AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error ?? "Local connection failed."), {
      status: response.status,
    });
  return data;
}
/** A single initial payload arrives over SSE; reconnects use the same stream. */
export function connectWorkspace(handlers: {
  snapshot: (snapshot: Snapshot) => void;
  sync: (sync: Snapshot["sync"]) => void;
  connected: (connected: boolean) => void;
  initialError: (message: string) => void;
}) {
  let stopped = false,
    receivedSnapshot = false,
    events: EventSource | undefined;
  const controller = new AbortController();
  const deadline = setTimeout(() => {
    if (stopped || receivedSnapshot) return;
    handlers.initialError(
      "The workspace is taking too long to respond. Reconnect to try again.",
    );
    if (!events) controller.abort();
  }, 12_000);
  void (async () => {
    try {
      await request("/api/session", { signal: controller.signal });
      if (stopped || controller.signal.aborted) return;
      events = new EventSource("/api/events");
      events.addEventListener("snapshot", (event) => {
        if (stopped) return;
        try {
          handlers.snapshot(JSON.parse((event as MessageEvent).data));
          receivedSnapshot = true;
          clearTimeout(deadline);
          handlers.initialError("");
          handlers.connected(true);
        } catch {
          handlers.connected(false);
          if (!receivedSnapshot)
            handlers.initialError(
              "The workspace response could not be read. Reconnect to try again.",
            );
        }
      });
      events.addEventListener("sync", (event) => {
        if (stopped || !receivedSnapshot) return;
        try {
          handlers.sync(JSON.parse((event as MessageEvent).data));
        } catch {
          /* Keep the last valid sync state. */
        }
      });
      events.onerror = () => {
        if (stopped) return;
        handlers.connected(false);
        if (!receivedSnapshot)
          handlers.initialError(
            "Connecting to the workspace failed. Retrying…",
          );
      };
    } catch (error) {
      if (!stopped && !controller.signal.aborted) {
        clearTimeout(deadline);
        handlers.connected(false);
        handlers.initialError((error as Error).message);
      }
    }
  })();
  return () => {
    stopped = true;
    clearTimeout(deadline);
    controller.abort();
    events?.close();
  };
}
export function useWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [pendingWorkspaceCommand, setPendingWorkspaceCommand] =
      useState<WorkspaceCommand | null>(null),
    [arrivals, setArrivals] = useState({
      pendingArrivalIds: [] as string[],
      newIds: [] as string[],
    });
  const arrivalQueue = useRef<ArrivalQueue | null>(null);
  const workspaceOutbox = useRef<WorkspaceOutbox | null>(null);
  const arrivalWorkspace = useRef<string | undefined>(undefined);
  const playArrivals = useCallback(
    (ids: string[]) => arrivalQueue.current?.play(ids),
    [],
  );
  const pauseArrivals = useCallback(() => arrivalQueue.current?.pause(), []);
  const current = useRef<Snapshot | null>(null),
    queue = useRef(Promise.resolve());
  function accept(next: Snapshot, requestedFrom?: Snapshot | null) {
    const previous = current.current;
    if (!shouldAcceptSnapshot(previous, next, requestedFrom)) return;
    if (
      !arrivalQueue.current ||
      arrivalWorkspace.current !== next.workspaceId
    ) {
      arrivalQueue.current?.pause(false);
      let storage: Storage | undefined;
      try {
        if (next.workspaceId) storage = window.localStorage;
      } catch {
        /* Private browser storage can be unavailable. */
      }
      arrivalWorkspace.current = next.workspaceId;
      workspaceOutbox.current =
        next.workspaceId && storage
          ? new WorkspaceOutbox(next.workspaceId, storage)
          : null;
      try {
        setPendingWorkspaceCommand(workspaceOutbox.current?.pending ?? null);
      } catch (e) {
        setPendingWorkspaceCommand(null);
        setError((e as Error).message);
      }
      arrivalQueue.current = new ArrivalQueue(
        next.workspaceId ?? "session",
        storage,
        () => {
          if (arrivalQueue.current) setArrivals(arrivalQueue.current.state);
        },
      );
    }
    arrivalQueue.current.observe(next.applications);
    current.current = next;
    registerCities(next.career?.cities ?? []);
    setSnapshot(next);
  }
  useEffect(() => {
    const hide = () => {
      if (document.hidden) arrivalQueue.current?.pause();
    };
    const leave = () => arrivalQueue.current?.pause();
    const storageChanged = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key.startsWith(
          `career-atlas.workspace-command.v1.${current.current?.workspaceId}.`,
        )
      ) {
        try {
          setPendingWorkspaceCommand(workspaceOutbox.current?.pending ?? null);
        } catch (e) {
          setError((e as Error).message);
        }
      }
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    window.addEventListener("storage", storageChanged);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);
  useEffect(() => {
    let connectionError = "";
    const disconnect = connectWorkspace({
      snapshot: accept,
      sync: (sync) => {
        if (!current.current) return;
        const next = { ...current.current, sync };
        current.current = next;
        registerCities(next.career?.cities ?? []);
        setSnapshot(next);
      },
      connected: setConnected,
      initialError: (message) => {
        const previousError = connectionError;
        connectionError = message;
        setError(
          (previous) => message || (previous === previousError ? "" : previous),
        );
      },
    });
    return () => {
      disconnect();
      arrivalQueue.current?.pause(false);
    };
  }, []);
  useEffect(() => {
    const loaded = document
      .querySelector<HTMLScriptElement>('script[type="module"][src]')
      ?.getAttribute("src");
    if (!loaded || !loaded.startsWith("/assets/")) return;
    const editing = () =>
      document.hidden ||
      !!document.querySelector(
        '[role="dialog"], [data-workspace-dirty="true"]',
      ) ||
      document.activeElement?.matches(
        'input, textarea, select, [contenteditable="true"]',
      );
    const timer = setInterval(() => {
      if (editing()) return;
      void request("/api/build")
        .then((build) => {
          if (build.module && build.module !== loaded && !editing())
            location.reload();
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  const command = (
    action: Command["action"],
    payload: Command["payload"] = {},
  ) => {
    const run = async () => {
      const before = current.current;
      if (!before) return;
      setBusy(true);
      setError("");
      try {
        const result = await request("/api/commands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            expectedRevision: before.view.revision,
            action,
            payload,
          }),
        });
        // Commands return view state, not data; always read the current generation.
        accept(await request("/api/snapshot"), before);
        return result;
      } catch (e) {
        setError((e as Error).message);
        try {
          accept(await request("/api/snapshot"), before);
        } catch {
          /* Keep the previous valid scene. */
        }
      } finally {
        setBusy(false);
      }
    };
    queue.current = queue.current.then(run, run);
    return queue.current;
  };
  const careerCommand = (
    action: string,
    payload: Record<string, unknown> = {},
    expectedRevision?: number,
  ) => {
    const run = async () => {
      const before = current.current;
      setBusy(true);
      setError("");
      try {
        const state = await request("/api/career");
        await request("/api/career/commands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            expectedRevision: expectedRevision ?? state.revision,
            action,
            payload,
          }),
        });
        accept(await request("/api/snapshot"), before);
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    };
    // Authority controls must not wait behind an unrelated, uncertain
    // workspace delivery. The server still checks the displayed revision.
    if (action === "grant-state") return run();
    const next = queue.current.then(run, run);
    queue.current = next.then(
      () => {},
      () => {},
    );
    return next;
  };
  const deliverWorkspaceCommand = (
    change: WorkspaceCommand,
    before: Snapshot,
    stage: boolean,
  ) => {
    const run = async () => {
      setBusy(true);
      setError("");
      let attempted = false;
      let accepted = false;
      const outbox = workspaceOutbox.current;
      try {
        if (current.current?.workspaceId !== before.workspaceId)
          throw new Error(
            "The workspace changed. Review the current workspace before trying again.",
          );
        if (!outbox)
          throw new Error(
            "This browser cannot preserve changes for safe delivery. Ask your agent to make this change.",
          );
        if (stage) outbox.stage(change);
        setPendingWorkspaceCommand(outbox.pending);
        attempted = true;
        const receipt = await request("/api/workspace/commands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(change),
        });
        if (
          receipt?.revision !== change.expectedRevision + 1 ||
          !Object.hasOwn(receipt, "result")
        )
          throw new Error(
            "The workspace command acknowledgment could not be verified.",
          );
        accepted = true;
        outbox.resolve(change.id);
        accept(await request("/api/snapshot"), before);
        return true;
      } catch (e) {
        const status = (e as Error & { status?: number }).status;
        if (attempted && status && status >= 400 && status < 500) {
          // Explicit validation/conflict responses roll back server writes.
          try {
            outbox?.resolve(change.id);
          } catch {
            /* A retry remains safe. */
          }
          setError(`The change was not saved. ${(e as Error).message}`);
        } else if (accepted) {
          setError(
            "The change was accepted, but the current view could not be confirmed. Reconnect or retry any pending change.",
          );
        } else if (attempted) {
          setError(
            "The change has not been confirmed. Retry the pending change; its request ID is preserved.",
          );
        } else {
          setError(`The change was not sent. ${(e as Error).message}`);
        }
        try {
          accept(await request("/api/snapshot"), before);
        } catch {
          /* Keep the last valid view and the request journal. */
        }
        return accepted;
      } finally {
        if (current.current?.workspaceId === before.workspaceId) {
          try {
            setPendingWorkspaceCommand(outbox?.pending ?? null);
          } catch (e) {
            setError((e as Error).message);
          }
        }
        setBusy(false);
      }
    };
    const next = queue.current.then(run, run);
    queue.current = next.then(
      () => {},
      () => {},
    );
    return next;
  };
  const workspaceCommand = (
    action: string,
    payload: Record<string, unknown> = {},
    expectedRevision?: number,
  ): Promise<boolean> => {
    const before = current.current;
    if (!before?.workspaceId || !before.workspace) {
      setError(
        "The agent workspace is not available yet. Reconnect before making this change.",
      );
      return Promise.resolve(false);
    }
    const parsed = workspaceCommandSchema.safeParse({
      id: crypto.randomUUID(),
      expectedRevision: expectedRevision ?? before.workspace.revision,
      actor: "person",
      channel: "app",
      action,
      payload,
    });
    if (!parsed.success) {
      setError(
        "This workspace change could not be prepared. Ask your agent to check it.",
      );
      return Promise.resolve(false);
    }
    return deliverWorkspaceCommand(parsed.data, before, true);
  };
  const retryPendingWorkspaceCommand = (): Promise<boolean> => {
    try {
      const pending = workspaceOutbox.current?.pending;
      const before = current.current;
      if (pending && before)
        return deliverWorkspaceCommand(pending, before, false);
    } catch (e) {
      setError((e as Error).message);
    }
    return Promise.resolve(false);
  };
  return {
    snapshot,
    error,
    clearError: () => setError(""),
    connected,
    busy,
    command,
    careerCommand,
    workspaceCommand,
    pendingWorkspaceCommand,
    retryPendingWorkspaceCommand,
    ...arrivals,
    playArrivals,
    pauseArrivals,
  };
}
export function useMedia(query: string) {
  const [value, setValue] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const update = () => setValue(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return value;
}
