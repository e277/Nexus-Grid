/**
 * Snapshot cache with stale-on-failure.
 *
 * Upstream sources are public, rate-limited, and occasionally down — the
 * World Bank starts returning empty bodies if you query it in a tight loop.
 * Caching is therefore not an optimization here, it is what keeps the
 * platform honest: when a refresh fails, the last good snapshot is served
 * with its original `fetched_at` and a status saying so, rather than a gap.
 */

import type { Snapshot } from "./types";

interface Entry {
  snapshot: Snapshot<unknown>;
  expiresAt: number;
}

const globalCache = globalThis as typeof globalThis & {
  __nexusGridSourceCache?: Map<string, Entry>;
};

function store(): Map<string, Entry> {
  if (!globalCache.__nexusGridSourceCache) globalCache.__nexusGridSourceCache = new Map();
  return globalCache.__nexusGridSourceCache;
}

/**
 * Return a fresh snapshot, refetching when the cached one has expired.
 *
 * `force` bypasses the freshness check. A failed fetch falls back to the last
 * snapshot marked `cached`, and only reports failure when there is nothing to
 * fall back to.
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<Snapshot<T>>,
  options: { force?: boolean } = {}
): Promise<Snapshot<T>> {
  const cache = store();
  const entry = cache.get(key);

  if (!options.force && entry && entry.expiresAt > Date.now()) {
    return entry.snapshot as Snapshot<T>;
  }

  try {
    // A source that returns is authoritative about its own status — an
    // `unauthorized` or `empty` answer is a real finding, not a cache miss to
    // paper over. Only a thrown error falls back to the previous snapshot.
    const snapshot = await fetcher();
    cache.set(key, { snapshot, expiresAt: Date.now() + ttlMs });
    return snapshot;
  } catch (error) {
    const note = error instanceof Error ? error.message : String(error);
    if (entry) return staleCopy(entry.snapshot as Snapshot<T>, note);
    throw error;
  }
}

function staleCopy<T>(snapshot: Snapshot<T>, note?: string): Snapshot<T> {
  return {
    records: snapshot.records,
    provenance: {
      ...snapshot.provenance,
      status: "cached",
      note: note
        ? `Refresh failed (${note}); serving the last good snapshot.`
        : "Serving the last good snapshot.",
    },
  };
}

/** Drop every cached snapshot, so the next read refetches. */
export function clearCache(): void {
  store().clear();
}

/** Fetch JSON with a timeout, failing loudly enough for the cache to log why. */
export async function fetchJson(url: string, timeoutMs = 15_000): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const text = await response.text();
  if (text.trim() === "") throw new Error("empty response body");
  return JSON.parse(text) as unknown;
}
