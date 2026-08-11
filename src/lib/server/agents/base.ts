/**
 * Base class and result type shared by all Nexus-Grid agents.
 *
 * Every agent exposes the contract required by the roadmap:
 *
 * - **inputs** — an event payload object
 * - **outputs** — a structured `AgentResult`
 * - **memory** — a bounded list of recent results per agent instance
 * - **logging** — a per-agent console prefix
 * - **confidence** — every result carries a 0..1 confidence score
 *
 * Results are persisted as agent-activity rows so operators can audit what
 * each agent did and why.
 */

import { recordAgentActivity } from "../services/activity";

const MEMORY_SIZE = 50;

export type AgentPayload = Record<string, unknown>;

/** Structured outcome of one agent invocation. */
export interface AgentResult {
  agent: string;
  action: string;
  confidence: number;
  rationale: string;
  outputs: Record<string, unknown>;
}

/** Template for agents: subclasses implement `handle`. */
export abstract class BaseAgent {
  abstract readonly name: string;

  private memory: AgentResult[] = [];

  /** Evaluate the payload and return a decision. */
  protected abstract handle(payload: AgentPayload): Promise<AgentResult>;

  /** Execute the agent: handle, remember, log, and persist the result. */
  async run(payload: AgentPayload): Promise<AgentResult> {
    const result = await this.handle(payload);

    this.memory.push(result);
    if (this.memory.length > MEMORY_SIZE) this.memory.shift();

    console.info(
      `${this.name} -> ${result.action} (confidence=${result.confidence.toFixed(2)}): ${result.rationale}`
    );

    try {
      recordAgentActivity({
        agentName: this.name,
        action: result.action,
        confidence: result.confidence,
        context: { payload, outputs: result.outputs },
      });
    } catch (error) {
      // Activity persistence must never break the decision path
      console.error("Failed to record agent activity", error);
    }
    return result;
  }

  /** Return the most recent results from memory (newest first). */
  recall(limit = 5): AgentResult[] {
    return this.memory.slice(-limit).reverse();
  }
}

/** Convenience constructor for an `AgentResult` with default outputs. */
export function result(
  agent: string,
  action: string,
  confidence: number,
  rationale: string,
  outputs: Record<string, unknown> = {}
): AgentResult {
  return { agent, action, confidence, rationale, outputs };
}
