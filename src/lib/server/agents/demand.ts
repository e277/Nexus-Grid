/**
 * Demand Intelligence Agent.
 *
 * Matches open demands to available crop supply, scores the opportunities,
 * and flags predicted shortages when open demand exceeds supply.
 */

import { crops } from "../repositories";
import { BaseAgent, result, type AgentPayload, type AgentResult } from "./base";

export class DemandIntelligenceAgent extends BaseAgent {
  readonly name = "demand_intelligence";

  protected async handle(payload: AgentPayload): Promise<AgentResult> {
    const cropName = payload.crop_name as string | undefined;
    const requested = (payload.quantity as number | undefined) || 0;

    const matching = cropName
      ? crops.all().filter((c) => (c.crop_name ?? "").toLowerCase() === cropName.toLowerCase())
      : crops.all();
    const available = matching.reduce((total, c) => total + (c.quantity || 0), 0);

    const matches = [...matching]
      .sort((a, b) => (b.quantity || 0) - (a.quantity || 0))
      .filter((c) => (c.quantity || 0) > 0)
      .slice(0, 5)
      .map((c) => ({
        crop_id: c.id,
        farmer_id: c.farmer_id,
        quantity: c.quantity,
        // Simple opportunity score: how much of the request one lot covers
        score: requested ? Math.round(Math.min((c.quantity || 0) / requested, 1.0) * 100) / 100 : 0.0,
      }));

    if (requested && available < requested) {
      return result(
        this.name,
        "predict_shortage",
        0.8,
        `Open demand for ${requested} of '${cropName}' exceeds available supply ${available}`,
        { available, requested, matches }
      );
    }

    return result(
      this.name,
      matches.length ? "match_buyers" : "no_supply_found",
      matches.length ? 0.9 : 0.5,
      `Found ${matches.length} candidate lots for '${cropName}'`,
      { available, requested, matches }
    );
  }
}
