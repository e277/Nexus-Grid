/**
 * One-time application startup.
 *
 * Registers the event handlers and starts the background agent loop. Every
 * route handler calls `ensureBootstrapped()`, so the first request into a
 * fresh process brings the system up.
 */

import { startAgents } from "./agents/runner";
import { registerEventHandlers } from "./events";
import { fetchAllSources } from "./sources";

const globalBootstrap = globalThis as typeof globalThis & {
  __nexusGridBootstrapped?: boolean;
};

export function ensureBootstrapped(): void {
  if (globalBootstrap.__nexusGridBootstrapped) return;
  globalBootstrap.__nexusGridBootstrapped = true;

  registerEventHandlers();

  // Warm the source caches in the background. Reads never block on the
  // network, so without this the first page load would show every source as
  // `pending` until something else triggered a fetch.
  void fetchAllSources(false).catch((error) => {
    console.error("Source warm-up failed", error);
  });

  try {
    startAgents();
  } catch (error) {
    console.error("Agent startup failed", error);
  }
}
