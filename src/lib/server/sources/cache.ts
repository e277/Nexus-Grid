/**
 * Snapshot cache: stale-while-revalidate, with in-flight de-duplication.
 *
 * Fetching every publisher takes the better part of a minute — Comtrade needs
 * 1.2s between fifteen states, SoilGrids 13s between three. A request must
 * never wait on that. So a read returns whatever is cached *immediately* and
 * refreshes in the background; only an explicit refresh awaits the network.
 *
 * A source with nothing cached yet reports `pending` rather than blocking or
 * pretending to be empty, and the console polls until it fills in. Concurrent
 * readers share one in-flight fetch, so polling cannot stampede a public API.
 */

import { provenance, type Snapshot, type SourceId } from "./types";

interface Entry {
  snapshot: Snapshot<unknown>;
  expiresAt: number;
}

interface CacheState {
  entries: Map<string, Entry>;
  inflight: Map<string, Promise<Snapshot<unknown>>>;
}

const globalCache = globalThis as typeof globalThis & {
  __nexusGridSourceCache?: CacheState;
};

function state(): CacheState {
  if (!globalCache.__nexusGridSourceCache) {
    globalCache.__nexusGridSourceCache = { entries: new Map(), inflight: new Map() };
  }
  return globalCache.__nexusGridSourceCache;
}

export interface CacheOptions {
  /** Await the network instead of serving what is cached. */
  force?: boolean;
  /** Describes the source in the `pending` placeholder. */
  pending?: { source: SourceId; publisher: string; endpoint: string };
}

/**
 * Start a refresh unless one is already running for this key.
 *
 * The promise is stored so concurrent readers join it rather than each firing
 * their own request at a rate-limited publisher.
 */
function refresh<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<Snapshot<T>>
): Promise<Snapshot<T>> {
  const cache = state();
  const existing = cache.inflight.get(key);
  if (existing) return existing as unknown as Promise<Snapshot<T>>;

  const run = (async () => {
    try {
      // A source that returns is authoritative about its own status — an
      // `unauthorized` or `empty` answer is a real finding, not a cache miss
      // to paper over.
      const snapshot = await fetcher();
      cache.entries.set(key, { snapshot, expiresAt: Date.now() + ttlMs });
      return snapshot;
    } catch (error) {
      const note = error instanceof Error ? error.message : String(error);
      const previous = cache.entries.get(key);
      if (previous) {
        // Keep serving the last good snapshot, and say that is what this is.
        const stale = staleCopy(previous.snapshot as Snapshot<T>, note);
        cache.entries.set(key, { snapshot: stale, expiresAt: Date.now() + ttlMs });
        return stale;
      }
      throw error;
    } finally {
      cache.inflight.delete(key);
    }
  })();

  cache.inflight.set(key, run as unknown as Promise<Snapshot<unknown>>);
  return run;
}

/**
 * Read a snapshot without waiting on the network.
 *
 * `force` awaits a fresh fetch; everything else returns cached data and
 * revalidates behind the request.
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<Snapshot<T>>,
  options: CacheOptions = {}
): Promise<Snapshot<T>> {
  const cache = state();
  const entry = cache.entries.get(key);

  if (options.force) return refresh(key, ttlMs, fetcher);

  if (entry) {
    // Expired: hand back what we have and revalidate behind the caller.
    if (entry.expiresAt <= Date.now()) {
      void refresh(key, ttlMs, fetcher).catch(() => {
        /* reported through the snapshot's own status on the next read */
      });
    }
    return entry.snapshot as Snapshot<T>;
  }

  // Nothing cached yet: start the fetch and answer `pending` this time round.
  void refresh(key, ttlMs, fetcher).catch(() => {
    /* reported through the snapshot's own status on the next read */
  });

  const descriptor = options.pending;
  return {
    records: [],
    provenance: provenance(
      descriptor?.source ?? "world-bank",
      descriptor?.publisher ?? key,
      descriptor?.endpoint ?? "",
      "pending",
      { note: "First fetch in progress — this fills in shortly." }
    ),
  };
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

/** True when every source has answered at least once. */
export function isWarm(keys: string[]): boolean {
  const cache = state();
  return keys.every((key) => cache.entries.has(key));
}

/** Drop every cached snapshot, so the next read refetches. */
export function clearCache(): void {
  const cache = state();
  cache.entries.clear();
  cache.inflight.clear();
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
