import { useCallback, useEffect, useState } from "react";
import { UnauthorizedError } from "./api";

let onUnauthorized: (() => void) | null = null;

/** Registered once by the app shell: called when any request hits a 401. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

interface PollState<T> {
  data: T | null;
  error: string | null;
  refresh: () => void;
}

/** Load data now and refresh on an interval; 401s route to the app shell. */
export function usePoll<T>(loader: () => Promise<T>, intervalMs = 10_000): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    function run() {
      loader()
        .then((result) => {
          if (!cancelled) {
            setData(result);
            setError(null);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof UnauthorizedError) {
            onUnauthorized?.();
            return;
          }
          setError(err instanceof Error ? err.message : "Request failed");
        });
    }

    run();
    const timer = setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, intervalMs]);

  return { data, error, refresh };
}
