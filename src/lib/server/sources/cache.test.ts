/**
 * The cache is what keeps a page load off the network — sources take the
 * better part of a minute to fetch — and what keeps the platform honest when a
 * publisher goes down. Both properties are easy to break silently, so they are
 * pinned here.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearCache, withCache } from "./cache";
import { provenance, type Snapshot } from "./types";

function snap(records: number[], status: "live" | "empty" = "live"): Snapshot<number> {
  return { records, provenance: provenance("world-bank", "test", "test", status) };
}

/** Let queued microtasks and the background refresh settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  clearCache();
});

describe("withCache", () => {
  it("answers `pending` on a cold read instead of waiting on the network", async () => {
    let resolveFetch: (value: Snapshot<number>) => void = () => {};
    const fetcher = vi.fn(
      () => new Promise<Snapshot<number>>((resolve) => (resolveFetch = resolve))
    );

    const first = await withCache("k", 1000, fetcher, {
      pending: { source: "world-bank", publisher: "World Bank", endpoint: "e" },
    });

    // Returned without the fetch having finished.
    expect(first.provenance.status).toBe("pending");
    expect(first.records).toEqual([]);
    expect(fetcher).toHaveBeenCalledOnce();

    resolveFetch(snap([1, 2]));
    await settle();

    const second = await withCache("k", 1000, fetcher);
    expect(second.records).toEqual([1, 2]);
    expect(second.provenance.status).toBe("live");
  });

  it("shares one in-flight fetch between concurrent readers", async () => {
    const fetcher = vi.fn(async () => snap([1]));

    await Promise.all([
      withCache("k", 1000, fetcher),
      withCache("k", 1000, fetcher),
      withCache("k", 1000, fetcher),
    ]);
    await settle();

    // Polling must not stampede a rate-limited publisher.
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("serves stale data and revalidates behind the reader", async () => {
    const fetcher = vi
      .fn<() => Promise<Snapshot<number>>>()
      .mockResolvedValueOnce(snap([1]))
      .mockResolvedValueOnce(snap([2]));

    await withCache("k", 0, fetcher);
    await settle();

    // TTL of 0 means the entry is already stale; the reader still gets it
    // immediately, and the refresh lands afterwards.
    const stale = await withCache("k", 0, fetcher);
    expect(stale.records).toEqual([1]);
    await settle();

    expect(fetcher).toHaveBeenCalledTimes(2);
    const refreshed = await withCache("k", 60_000, fetcher);
    expect(refreshed.records).toEqual([2]);
  });

  it("keeps the last good snapshot when a refresh fails, and says so", async () => {
    const fetcher = vi
      .fn<() => Promise<Snapshot<number>>>()
      .mockResolvedValueOnce(snap([1]))
      .mockRejectedValueOnce(new Error("upstream down"));

    await withCache("k", 0, fetcher);
    await settle();

    await withCache("k", 0, fetcher); // triggers the failing refresh
    await settle();

    const served = await withCache("k", 60_000, fetcher);
    expect(served.records).toEqual([1]);
    expect(served.provenance.status).toBe("cached");
    expect(served.provenance.note).toContain("upstream down");
  });

  it("trusts a source that reports its own degraded status", async () => {
    // `empty` is a real finding — reachable, nothing usable — and must not be
    // rewritten into something more optimistic.
    const fetcher = vi.fn(async () => snap([], "empty"));

    await withCache("k", 60_000, fetcher);
    await settle();

    const served = await withCache("k", 60_000, fetcher);
    expect(served.provenance.status).toBe("empty");
  });

  it("awaits the network when forced", async () => {
    const fetcher = vi.fn(async () => snap([9]));

    const forced = await withCache("k", 60_000, fetcher, { force: true });
    expect(forced.records).toEqual([9]);
    expect(forced.provenance.status).toBe("live");
  });
});

describe("hot-reload resilience", () => {
  it("rebuilds when globalThis holds a shape from an older version", async () => {
    // A dev server that started before this module was rewritten keeps the old
    // value across the reload. Reading it blew up with
    // "cache.entries.get is not a function"; the shape check makes it heal.
    const g = globalThis as Record<string, unknown>;
    g.__nexusGridSourceCache = new Map();

    const served = await withCache("k", 60_000, async () => snap([7]), { force: true });
    expect(served.records).toEqual([7]);
  });
});
