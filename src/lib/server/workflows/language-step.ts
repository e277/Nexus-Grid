import { withSignalDefaults } from "./supply-rules";
import { recommendSupplyResponse, type Recommendation } from "./llm-recommend";
import { dispatchStatus } from "../dispatch/openclaw";
import type { SupplyState, SupplyUpdate } from "./supply-chain-graph";

/**
 * Ask for a recommendation, short-circuiting when nothing needs attention.
 *
 * A minor gap doesn't warrant an LLM call — the rule answer is both cheaper
 * and more honest. It returns the same shape as a model answer so the console
 * has one thing to render, and labels its source `rule` so the difference is
 * never hidden.
 */
export async function recommendAction(state: SupplyState): Promise<SupplyUpdate> {
  if (state.gap_severity === "minor") {
    const ruled: Recommendation = {
      source: "rule",
      action: "Continue monitoring regional sourcing.",
      rationale:
        "The observed gap is below the coordination threshold, so there is nothing for a " +
        "member state to act on yet.",
      confidence: 0.9,
      risks: [],
      structured: true,
      dispatch_channel: dispatchStatus(),
    };
    return { phase: "recommend", recommendation: ruled, source: "rule" };
  }

  return {
    phase: "recommend",
    recommendation: await recommendSupplyResponse(withSignalDefaults(state)),
  };
}
