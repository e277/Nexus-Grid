/**
 * Logistics Agent.
 *
 * Assesses the lane between a regional supplier and an importer: real
 * great-circle distance between their ports, a transit estimate from a
 * documented average speed, and the live climate risk at each end.
 *
 * Honest about what it is — a geography-and-weather estimate, not a carrier
 * booking. No free inter-island freight API exists to check capacity against,
 * and the agent says so rather than inventing a vessel.
 */

import { getRoutingProvider } from "../sources/routing";
import { byIso3, byName } from "../sources";
import { currentPicture } from "./context";
import { BaseAgent, result, type AgentPayload, type AgentResult } from "./base";

export class LogisticsAgent extends BaseAgent {
  readonly name = "logistics";

  protected async handle(payload: AgentPayload): Promise<AgentResult> {
    const picture = await currentPicture();
    const originName = payload.origin as string | undefined;
    const destinationName = payload.destination as string | undefined;

    const origin =
      byName(originName ?? "") ?? (originName ? byIso3(originName) : null);
    const destination =
      byName(destinationName ?? "") ?? (destinationName ? byIso3(destinationName) : null);

    if (!origin || !destination) {
      return result(
        this.name,
        "lane_unresolved",
        0.9,
        `Could not resolve ${originName ?? "?"} → ${destinationName ?? "?"} to member states`,
        { origin: originName, destination: destinationName }
      );
    }

    const transit = getRoutingProvider().estimateTransit(origin.name, destination.name);

    const riskAt = (iso3: string) =>
      picture.states.find((s) => s.iso3 === iso3)?.climate_risk ?? null;
    const originRisk = riskAt(origin.iso3);
    const destinationRisk = riskAt(destination.iso3);
    const elevated = [originRisk, destinationRisk].filter(
      (r) => r === "high" || r === "medium"
    ).length;

    // Weather at either end is the one part of this the platform observes
    // live, so it carries the confidence; the transit figure is an estimate.
    const confidence = elevated > 0 ? 0.85 : 0.6;

    return result(
      this.name,
      elevated > 0 ? "lane_at_risk" : "lane_viable",
      confidence,
      `${origin.name} → ${destination.name}: ~${transit.transit_hours}h by ${transit.mode}` +
        (transit.distance_km ? ` over ${transit.distance_km}km` : "") +
        (elevated > 0
          ? `; elevated climate risk at ${elevated === 2 ? "both ends" : "one end"}`
          : ""),
      {
        origin: origin.name,
        destination: destination.name,
        transit,
        origin_climate_risk: originRisk,
        destination_climate_risk: destinationRisk,
        capacity_source: "none — no free inter-island freight capacity API is available",
      }
    );
  }
}
