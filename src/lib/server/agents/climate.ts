/**
 * Climate Risk Agent.
 *
 * Evaluates weather alerts, identifies shipments at risk in affected islands,
 * and recommends rerouting or holds.
 */

import { shipments } from "../repositories";
import { BaseAgent, result, type AgentPayload, type AgentResult } from "./base";

const SEVERITY_RISK: Record<string, number> = { low: 0.2, medium: 0.5, high: 0.8, severe: 0.95 };

export class ClimateRiskAgent extends BaseAgent {
  readonly name = "climate_risk";

  protected async handle(payload: AgentPayload): Promise<AgentResult> {
    const severity = (payload.severity as string | undefined) ?? "low";
    const risk = SEVERITY_RISK[severity] ?? 0.2;
    const islands = ((payload.affected_islands as string | undefined) ?? "")
      .split(",")
      .map((island) => island.trim())
      .filter(Boolean);

    let atRisk: { shipment_id: number; origin: string; destination: string }[] = [];
    if (islands.length > 0) {
      atRisk = shipments
        .all()
        .filter((s) => s.status === "planned" || s.status === "in_transit")
        .filter(
          (s) => islands.includes(s.origin_island) || islands.includes(s.destination_island)
        )
        .map((s) => ({
          shipment_id: s.id,
          origin: s.origin_island,
          destination: s.destination_island,
        }));
    }

    let action: string;
    let rationale: string;
    if (risk >= 0.8 && atRisk.length > 0) {
      action = "recommend_reroute";
      rationale =
        `${severity} ${payload.event_type ?? "event"} threatens ` +
        `${atRisk.length} active shipment(s) in ${islands.join(", ")}`;
    } else if (risk >= 0.5) {
      action = "monitor_disruption";
      rationale = `${severity} event: tracking ${atRisk.length} potentially exposed shipment(s)`;
    } else {
      action = "no_action";
      rationale = `${severity} event poses minimal supply chain risk`;
    }

    return result(this.name, action, action !== "no_action" ? risk : 1 - risk, rationale, {
      risk,
      affected_islands: islands,
      shipments_at_risk: atRisk,
    });
  }
}
