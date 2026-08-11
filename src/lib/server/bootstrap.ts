/**
 * One-time application startup.
 *
 * Registers the event handlers and starts the background agent loop. Every
 * route handler calls `ensureBootstrapped()`, so the first request into a
 * fresh process brings the system up.
 */

import { startAgents } from "./agents/runner";
import { registerEventHandlers } from "./events";

const globalBootstrap = globalThis as typeof globalThis & {
  __nexusGridBootstrapped?: boolean;
};

export function ensureBootstrapped(): void {
  if (globalBootstrap.__nexusGridBootstrapped) return;
  globalBootstrap.__nexusGridBootstrapped = true;

  registerEventHandlers();

  try {
    startAgents();
  } catch (error) {
    console.error("Agent startup failed", error);
  }
}
