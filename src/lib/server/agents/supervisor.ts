/**
 * Supervisor Agent.
 *
 * Routes incoming events to the specialist agent responsible for them and
 * returns that specialist's result. This is the single dispatch point used by
 * the event system.
 */

import { BaseAgent, result, type AgentPayload, type AgentResult } from "./base";
import { ClimateRiskAgent } from "./climate";
import { CustomsAgent } from "./customs";
import { DemandIntelligenceAgent } from "./demand";
import { LogisticsAgent } from "./logistics";

export class SupervisorAgent extends BaseAgent {
  readonly name = "supervisor";

  readonly demand = new DemandIntelligenceAgent();
  readonly logistics = new LogisticsAgent();
  readonly climate = new ClimateRiskAgent();
  readonly customs = new CustomsAgent();

  /** Event → specialist routing table */
  private readonly routes: Record<string, BaseAgent> = {
    "buyer.request.created": this.demand,
    "crop.harvest.ready": this.demand,
    "weather.alert": this.climate,
    "shipment.delayed": this.logistics,
    "shipment.departed": this.customs,
    "customs.approved": this.logistics,
  };

  protected async handle(payload: AgentPayload): Promise<AgentResult> {
    const event = (payload.event as string | undefined) ?? "";
    const specialist = this.routes[event];

    if (specialist === undefined) {
      return result(
        this.name,
        "no_route",
        1.0,
        `No specialist registered for event '${event}'`,
        { event }
      );
    }

    const specialistResult = await specialist.run(payload);
    return result(
      this.name,
      `delegated:${specialist.name}`,
      specialistResult.confidence,
      `Routed '${event}' to ${specialist.name}`,
      { ...specialistResult }
    );
  }

  /** Convenience entry point for the event bus. */
  dispatch(event: string, payload: AgentPayload): Promise<AgentResult> {
    return this.run({ ...payload, event });
  }
}

const globalSupervisor = globalThis as typeof globalThis & {
  __nexusGridSupervisor?: SupervisorAgent;
};

if (!globalSupervisor.__nexusGridSupervisor) {
  globalSupervisor.__nexusGridSupervisor = new SupervisorAgent();
}

/** The process-wide supervisor, so agent memory survives hot reloads. */
export const supervisor: SupervisorAgent = globalSupervisor.__nexusGridSupervisor;
