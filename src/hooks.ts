import { useCallback, useEffect, useState } from "react";

interface PollState<T> {
  data: T | null;
  error: string | null;
  refresh: () => void;
  /** When the last successful response landed, for a freshness indicator. */
  updatedAt: number | null;
  /** True while a fetch is in flight, including the silent interval ones. */
  refreshing: boolean;
  /** The cadence, so a reader can be told how often this refreshes itself. */
  intervalMs: number;
}

/**
 * Load data now and refresh on an interval.
 *
 * `deps` re-runs the loader when something it closes over changes — a domain
 * switcher, say. Without it the effect only re-ran on the tick, so a caller
 * that changed what it was asking for kept the previous answer until the next
 * interval, which reads as a tab that does not respond.
 */
export function usePoll<T>(
  loader: () => Promise<T>,
  intervalMs = 10_000,
  deps: unknown[] = []
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    function run() {
      if (!cancelled) setRefreshing(true);
      loader()
        .then((result) => {
          if (!cancelled) {
            setData(result);
            setError(null);
            setUpdatedAt(Date.now());
          }
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Request failed");
        })
        .finally(() => {
          if (!cancelled) setRefreshing(false);
        });
    }

    run();
    const timer = setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, intervalMs, ...deps]);

  return { data, error, refresh, updatedAt, refreshing, intervalMs };
}
