import { registerCities } from "../shared/locations";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrivalQueue } from "./arrivalQueue";
import type { Command, Snapshot } from "../shared/model";
async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Local connection failed.");
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
    [arrivals, setArrivals] = useState({
      pendingArrivalIds: [] as string[],
      newIds: [] as string[],
    });
  const arrivalQueue = useRef<ArrivalQueue | null>(null);
  const arrivalWorkspace = useRef<string | undefined>(undefined);
  const playArrivals = useCallback(
    (ids: string[]) => arrivalQueue.current?.play(ids),
    [],
  );
  const pauseArrivals = useCallback(() => arrivalQueue.current?.pause(), []);
  const current = useRef<Snapshot | null>(null),
    queue = useRef(Promise.resolve());
  function accept(next: Snapshot) {
    const previous = current.current;
    if (
      previous &&
      previous.workspaceId === next.workspaceId &&
      (next.generation < previous.generation ||
        next.view.revision < previous.view.revision)
    )
      return;
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
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
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
    const timer = setInterval(() => {
      if (document.hidden || document.querySelector('[role="dialog"]')) return;
      void request("/api/build")
        .then((build) => {
          if (
            build.module &&
            build.module !== loaded &&
            !document.hidden &&
            !document.querySelector('[role="dialog"]')
          )
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
        accept(await request("/api/snapshot"));
        return result;
      } catch (e) {
        setError((e as Error).message);
        try {
          accept(await request("/api/snapshot"));
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
        accept(await request("/api/snapshot"));
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      } finally {
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
  return {
    snapshot,
    error,
    clearError: () => setError(""),
    connected,
    busy,
    command,
    careerCommand,
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
