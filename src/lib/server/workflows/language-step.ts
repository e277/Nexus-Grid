import { withSignalDefaults } from "../services/supply-rules";
import { recommendSupplyResponse } from "./llm-recommend";
import type { SupplyState } from "./supply-chain-graph";

/**
 * Ask for a recommendation, short-circuiting when nothing needs attention.
 *
 * A normal-risk, non-anomalous signal doesn't warrant an LLM call — the rule
 * answer is both cheaper and more honest.
 */
export async function recommendAction(state: SupplyState): Promise<Partial<SupplyState>> {
  const event = state.event;
  if (event !== "surplus" && event !== "shortage" && state.supply_risk === "normal") {
    return {
      phase: "recommend",
      recommendation: "No urgent action required. Continue monitoring supply signals.",
      source: "rule",
    };
  }

  return {
    phase: "recommend",
    recommendation: await recommendSupplyResponse(withSignalDefaults(state)),
  };
}
