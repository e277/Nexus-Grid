/** Rate limiting with an in-memory sliding window, keyed by client address. */

import { getSettings } from "./config";

const WINDOW_SECONDS = 60;

const globalWindow = globalThis as typeof globalThis & {
  __nexusGridRateLimit?: Map<string, number[]>;
};

function hits(): Map<string, number[]> {
  if (!globalWindow.__nexusGridRateLimit) globalWindow.__nexusGridRateLimit = new Map();
  return globalWindow.__nexusGridRateLimit;
}

/** Per-process sliding window: true if the client is under the limit. */
export function allow(client: string, limit = getSettings().rateLimitPerMinute): boolean {
  const now = Date.now() / 1000;
  const table = hits();
  const window = table.get(client) ?? [];

  let start = 0;
  while (start < window.length && now - window[start] > WINDOW_SECONDS) start += 1;
  const recent = start > 0 ? window.slice(start) : window;

  if (recent.length >= limit) {
    table.set(client, recent);
    return false;
  }
  recent.push(now);
  table.set(client, recent);
  return true;
}

/** Best-effort client identity from proxy headers. */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
