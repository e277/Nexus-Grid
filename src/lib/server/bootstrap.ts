/**
 * One-time application startup.
 *
 * Seeds the demo dataset, registers the event handlers, and starts the
 * background agent loop. Every route handler calls `ensureBootstrapped()`, so
 * the first request into a fresh process brings the system up.
 */

import { startAgents } from "./agents/runner";
import { registerEventHandlers } from "./events";
import { seedDemoData } from "./store";

const globalBootstrap = globalThis as typeof globalThis & {
  __nexusGridBootstrapped?: boolean;
};

export function ensureBootstrapped(): void {
  if (globalBootstrap.__nexusGridBootstrapped) return;
  globalBootstrap.__nexusGridBootstrapped = true;

  registerEventHandlers();

  try {
    seedDemoData();
  } catch (error) {
    console.error("Demo seed failed", error);
  }

  try {
    startAgents();
  } catch (error) {
    console.error("Agent startup failed", error);
  }
}
