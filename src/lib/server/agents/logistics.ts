/**
 * Logistics Agent.
 *
 * Plans transportation for a shipment request: selects an active carrier with
 * sufficient capacity and prefers an active trade route between the origin
 * and destination islands.
 */

import type { TradeRoute } from "../models";
import { carriers, ports, tradeRoutes } from "../repositories";
import { BaseAgent, result, type AgentPayload, type AgentResult } from "./base";

export class LogisticsAgent extends BaseAgent {
  readonly name = "logistics";

  private findRoute(
    origin: string | undefined,
    destination: string | undefined
  ): TradeRoute | null {
    if (!origin || !destination) return null;

    const portsById = new Map(ports.all().map((port) => [port.id, port]));
    for (const route of tradeRoutes.all().filter((r) => r.active)) {
      const originPort = portsById.get(route.origin_port_id);
      const destinationPort = portsById.get(route.destination_port_id);
      if (
        originPort &&
        destinationPort &&
        originPort.island === origin &&
        destinationPort.island === destination &&
        originPort.status !== "closed" &&
        destinationPort.status !== "closed"
      ) {
        return route;
      }
    }
    return null;
  }

  protected async handle(payload: AgentPayload): Promise<AgentResult> {
    const quantity = (payload.quantity as number | undefined) || 0;
    const origin = payload.origin_island as string | undefined;
    const destination = payload.destination_island as string | undefined;

    const active = carriers
      .all()
      .filter((carrier) => carrier.active)
      .sort((a, b) => (b.capacity || 0) - (a.capacity || 0));
    const carrier = active.find((c) => (c.capacity || 0) >= quantity) ?? null;
    const route = this.findRoute(origin, destination);

    if (carrier === null) {
      return result(
        this.name,
        "no_capacity",
        0.7,
        `No active carrier can move ${quantity} units`,
        { quantity, carriers_considered: active.length }
      );
    }

    return result(
      this.name,
      "plan_transport",
      route ? 0.9 : 0.6,
      `Selected carrier '${carrier.name}'` +
        (route ? ` on route '${route.name}'` : " (no registered route; direct booking)"),
      {
        carrier_id: carrier.id,
        carrier: carrier.name,
        mode: carrier.mode,
        route_id: route ? route.id : null,
        transit_hours: route ? route.transit_hours : null,
      }
    );
  }
}
