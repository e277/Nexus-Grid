import { withSignalDefaults } from "../services/supply-rules";
import { recommendSupplyResponse } from "./llm-recommend";
import type { SupplyState } from "./supply-chain-graph";

/**
 * Ask for a recommendation, short-circuiting when nothing needs attention.
 *
 * A minor gap doesn't warrant an LLM call — the rule answer is both cheaper
 * and more honest.
 */
export async function recommendAction(state: SupplyState): Promise<Partial<SupplyState>> {
  if (state.gap_severity === "minor") {
    return {
      phase: "recommend",
      recommendation:
        "Gap is below the coordination threshold. Continue monitoring regional sourcing.",
      source: "rule",
    };
  }

  return {
    phase: "recommend",
    recommendation: await recommendSupplyResponse(withSignalDefaults(state)),
  };
}
