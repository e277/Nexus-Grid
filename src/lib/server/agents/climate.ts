/**
 * Climate Risk Agent.
 *
 * Reads the live per-island outlook and active storms, and names which
 * regional supply lanes that exposure actually threatens — a high-risk island
 * matters more when it is the one already supplying the region.
 */

import { currentPicture } from "./context";
import { BaseAgent, result, type AgentPayload, type AgentResult } from "./base";

export class ClimateRiskAgent extends BaseAgent {
  readonly name = "climate_risk";

  protected async handle(_payload: AgentPayload): Promise<AgentResult> {
    const picture = await currentPicture();
    const atRisk = picture.climate.islands_at_risk;
    const storms = picture.climate.active_storms;
    const high = atRisk.filter((c) => c.risk === "high");

    if (atRisk.length === 0 && storms.length === 0) {
      return result(
        this.name,
        "no_action",
        0.9,
        "No island at elevated risk and no active storms in the basin",
        { islands_at_risk: 0, active_storms: 0 }
      );
    }

    // Which at-risk states are also acting as regional suppliers — that is
    // what turns a weather forecast into a supply-chain exposure.
    const supplierNames = new Set(
      picture.substitution_opportunities.flatMap((o) => o.regional_suppliers)
    );
    const exposedSuppliers = atRisk
      .filter((island) => supplierNames.has(island.island))
      .map((island) => island.island);

    const action =
      storms.length > 0 || (high.length > 0 && exposedSuppliers.length > 0)
        ? "recommend_hold"
        : high.length > 0
          ? "monitor_disruption"
          : "watch";

    return result(
      this.name,
      action,
      storms.length > 0 ? 0.95 : high.length > 0 ? 0.8 : 0.5,
      `${high.length} island(s) at high risk, ${storms.length} active storm(s)` +
        (exposedSuppliers.length > 0
          ? `; regional suppliers exposed: ${exposedSuppliers.join(", ")}`
          : "; no regional supplier currently exposed"),
      {
        islands_at_risk: atRisk.map((i) => ({
          island: i.island,
          risk: i.risk,
          summary: i.summary,
        })),
        active_storms: storms,
        exposed_suppliers: exposedSuppliers,
      }
    );
  }
}
