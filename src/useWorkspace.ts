import { useEffect, useRef, useState } from "react";
import type { Command, Snapshot } from "../shared/model";
async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Local connection failed.");
  return data;
}
export function useWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [newIds, setNewIds] = useState<string[]>([]);
  const arrivalTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const current = useRef<Snapshot | null>(null),
    queue = useRef(Promise.resolve());
  function accept(next: Snapshot) {
    const previous = current.current;
    if (
      previous &&
      (next.generation < previous.generation ||
        next.view.revision < previous.view.revision)
    )
      return;
    if (previous && next.generation > previous.generation) {
      const known = new Set(previous.applications.map((a) => a.id));
      const added = next.applications
        .filter((a) => !known.has(a.id))
        .map((a) => a.id);
      if (added.length) {
        setNewIds((ids) => [...new Set([...ids, ...added])]);
        for (const id of added) {
          clearTimeout(arrivalTimers.current.get(id));
          arrivalTimers.current.set(
            id,
            setTimeout(() => {
              setNewIds((ids) => ids.filter((item) => item !== id));
              arrivalTimers.current.delete(id);
            }, 3600),
          );
        }
      }
    }
    current.current = next;
    setSnapshot(next);
  }
  useEffect(() => {
    let stopped = false,
      events: EventSource | undefined;
    void (async () => {
      try {
        await request("/api/session");
        const data = await request("/api/snapshot");
        if (stopped) return;
        accept(data);
        events = new EventSource("/api/events");
        events.addEventListener("snapshot", (e) => {
          accept(JSON.parse((e as MessageEvent).data));
          setConnected(true);
        });
        events.addEventListener("sync", (e) => {
          if (current.current)
            accept({
              ...current.current,
              sync: JSON.parse((e as MessageEvent).data),
            });
        });
        events.onerror = () => setConnected(false);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      stopped = true;
      events?.close();
      for (const timer of arrivalTimers.current.values()) clearTimeout(timer);
      arrivalTimers.current.clear();
    };
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
  return {
    snapshot,
    error,
    clearError: () => setError(""),
    connected,
    busy,
    command,
    newIds,
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
