/**
 * Supervisor Agent.
 *
 * Routes each coordination event to the specialist responsible for it and
 * returns that specialist's result. Single dispatch point for the event system.
 */

import { AgronomyAgent } from "./agronomy";
import { BaseAgent, result, type AgentPayload, type AgentResult } from "./base";
import { ClimateRiskAgent } from "./climate";
import { DemandIntelligenceAgent } from "./demand";
import { LogisticsAgent } from "./logistics";
import { PlantingCoordinationAgent } from "./planting";

export class SupervisorAgent extends BaseAgent {
  readonly name = "supervisor";

  readonly demand = new DemandIntelligenceAgent();
  readonly logistics = new LogisticsAgent();
  readonly climate = new ClimateRiskAgent();
  readonly planting = new PlantingCoordinationAgent();
  readonly agronomy = new AgronomyAgent();

  /** Event → specialist routing table */
  private readonly routes: Record<string, BaseAgent> = {
    "substitution.gap.detected": this.demand,
    "demand.review.requested": this.demand,
    "climate.risk.elevated": this.climate,
    "storm.alert": this.climate,
    "lane.assessment.requested": this.logistics,
    "planting.window.review": this.planting,
    "soil.assessment.requested": this.agronomy,
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
