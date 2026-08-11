/** Periodic runner loop for the supply agent. */

import { getSettings } from "../config";
import { SupplyAgent } from "./supply";

const globalRunner = globalThis as typeof globalThis & {
  __nexusGridSupplyAgent?: SupplyAgent;
  __nexusGridAgentTimer?: NodeJS.Timeout;
};

/** The process-wide supply agent, so its memory survives hot reloads. */
export function getSupplyAgent(): SupplyAgent {
  if (!globalRunner.__nexusGridSupplyAgent) {
    globalRunner.__nexusGridSupplyAgent = new SupplyAgent();
  }
  return globalRunner.__nexusGridSupplyAgent;
}

/**
 * Start the periodic scan loop.
 *
 * Each tick runs the agent against current inventory on the configured
 * interval. The timer is unref'd so it never keeps the process alive on its
 * own, and is stored on `globalThis` so a hot reload replaces rather than
 * duplicates it.
 */
export function startAgents(): void {
  const settings = getSettings();
  if (settings.skipAgentStartup) {
    console.info("Agent startup skipped (SKIP_AGENT_STARTUP)");
    return;
  }

  if (globalRunner.__nexusGridAgentTimer) {
    clearInterval(globalRunner.__nexusGridAgentTimer);
  }

  let running = false;
  const timer = setInterval(async () => {
    // Skip a tick rather than overlapping if the previous scan is still going
    if (running) return;
    running = true;
    try {
      const events = await getSupplyAgent().runCheck();
      console.info(`Agent run completed, ${events} events`);
    } catch (error) {
      console.error("Agent loop failed", error);
    } finally {
      running = false;
    }
  }, settings.agentPollIntervalSeconds * 1000);

  timer.unref?.();
  globalRunner.__nexusGridAgentTimer = timer;
  console.info(`Agent loop started (every ${settings.agentPollIntervalSeconds}s)`);
}
