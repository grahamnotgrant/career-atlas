import { useEffect, useState } from "react";

type Visibility = Pick<
  Document,
  "hidden" | "addEventListener" | "removeEventListener"
>;

export function subscribeToTime(
  deadlines: readonly string[],
  onChange: (now: number) => void,
  visibility: Visibility = document,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const update = () => {
    clearTimeout(timer);
    if (stopped) return;
    const now = Date.now();
    onChange(now);
    if (visibility.hidden) return;
    const remaining = deadlines.map(Date.parse).filter((at) => at > now);
    timer = setTimeout(
      update,
      Math.min(60_000, ...remaining.map((at) => at - now)),
    );
  };
  const visibilityChanged = () => {
    clearTimeout(timer);
    if (!visibility.hidden) update();
  };
  visibility.addEventListener("visibilitychange", visibilityChanged);
  update();
  return () => {
    stopped = true;
    clearTimeout(timer);
    visibility.removeEventListener("visibilitychange", visibilityChanged);
  };
}

/** Time-dependent presentation updates without changing canonical records. */
export function useNow(deadlines: readonly string[] = []) {
  const [now, setNow] = useState(Date.now);
  const key = deadlines.join("\n");
  useEffect(() => subscribeToTime(key.split("\n"), setNow), [key]);
  return now;
}
