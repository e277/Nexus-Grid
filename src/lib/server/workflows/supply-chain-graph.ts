/**
 * Core supply-chain workflow graph.
 *
 * Implements the roadmap control loop as a stateful graph:
 *
 *     perceive → assess → recommend → plan → (approval gate) → execute
 *         → monitor → recover
 *                  ↘ assess (re-plan once when a disruption is detected)
 *
 * State is a plain object so each node returns only the keys it updates and
 * the runtime merges them into the shared state. The compiled graph uses an
 * in-memory checkpointer so each run's state history is inspectable and
 * resumable by thread id.
 */

import { classifyQuantity, withSignalDefaults } from "../services/supply-rules";
import { utcnowIso } from "../time";
import { CompiledGraph, MemoryCheckpointer, StateGraph } from "./graph";
import { recommendAction } from "./language-step";
import { openclawRuntimeStatus } from "./llm-recommend";

const MAX_REPLANS = 1;
const RECOMMEND_ATTEMPTS = 3;

export interface SupplyState {
  // Incoming signal context
  event?: string;
  crop_id?: number | null;
  crop_name?: string | null;
  quantity?: number;
  farmer_id?: number | null;
  farmer_name?: string | null;
  island?: string | null;
  harvest_date?: string | null;
  message?: string | null;
  market_context?: string;
  weather_risk?: string;
  logistics_status?: string;
  demand_signal?: string;
  require_approval?: boolean;
  // Derived along the workflow
  phase?: string;
  supply_risk?: string;
  observed_at?: string;
  decision?: string;
  decision_rationale?: string;
  rationale?: string;
  recommendation?: unknown;
  source?: string;
  plan?: Record<string, unknown>;
  execution?: Record<string, unknown>;
  monitor?: Record<string, unknown>;
  recovery?: Record<string, unknown>;
  replan_count?: number;
}

export function perceive(state: SupplyState): Partial<SupplyState> {
  const normalized = withSignalDefaults(state);
  return {
    phase: "perceive",
    ...normalized,
    supply_risk: classifyQuantity(normalized.quantity),
    observed_at: utcnowIso(),
    replan_count: state.replan_count ?? 0,
  };
}

export function assess(state: SupplyState): Partial<SupplyState> {
  const event = state.event ?? "inventory_checked";
  const supplyRisk = state.supply_risk ?? "normal";
  const quantity = state.quantity ?? 0;

  let decision = "monitor";
  if (event === "surplus" || supplyRisk === "surplus") {
    decision = "allocate_surplus";
  } else if (event === "shortage" || supplyRisk === "shortage") {
    decision = "trigger_shortage_response";
  }

  const rationale = `event=${event}, quantity=${quantity}, supply_risk=${supplyRisk}`;
  return {
    phase: "assess",
    decision,
    decision_rationale: rationale,
    rationale,
  };
}

export async function recommend(state: SupplyState): Promise<Partial<SupplyState>> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= RECOMMEND_ATTEMPTS; attempt += 1) {
    try {
      return await recommendAction(state);
    } catch (error) {
      // Retry transient LLM/tooling failures
      lastError = error;
      console.warn(`recommend attempt ${attempt}/${RECOMMEND_ATTEMPTS} failed:`, error);
    }
  }
  return {
    phase: "recommend",
    recommendation: {
      source: "error",
      recommendation: "Recommendation unavailable after retries.",
      error: lastError instanceof Error ? lastError.message : String(lastError),
    },
  };
}

export function plan(state: SupplyState): Partial<SupplyState> {
  const decision = state.decision ?? "monitor";
  let planData: Record<string, unknown>;

  if (decision === "allocate_surplus") {
    planData = {
      action: "dispatch_surplus",
      priority: "high",
      target: "demand hub",
      route: "cold-chain express",
      logistics: {
        mode: "truck",
        temperature: "2-4°C",
      },
    };
  } else if (decision === "trigger_shortage_response") {
    planData = {
      action: "escalate_shortage",
      priority: "urgent",
      target: "operations team",
      strategy: "reallocate stock and request emergency import",
      notification: {
        channel: "operations-alert",
        severity: "high",
      },
    };
  } else {
    planData = {
      action: "monitor",
      priority: "normal",
      target: "supply dashboard",
      instruction: "continue ingesting demand, weather, and logistics signals",
    };
  }

  planData.recommendation = state.recommendation;
  return { phase: "plan", plan: planData };
}

/** Approval gate: urgent plans go to a human unless pre-approved. */
export function needsApproval(state: SupplyState): string {
  const planData = state.plan ?? {};
  const priority = planData.priority as string | undefined;
  if (state.require_approval && (priority === "high" || priority === "urgent")) {
    return "hold";
  }
  return "execute";
}

/**
 * Pause the graph for a real human decision.
 *
 * `interrupt()` throws on first entry, checkpointing state and halting the
 * run — the caller sees `status: awaiting_approval` with this task as the
 * payload. A client resumes via the same thread id (see
 * `orchestrator.resumeRun`), at which point this node re-runs from the top
 * and `interrupt()` returns the supplied decision instead of throwing again.
 */
export function holdForApproval(
  state: SupplyState,
  context: { interrupt(value: unknown): unknown }
): Partial<SupplyState> {
  const planData = state.plan ?? {};
  const task: Record<string, unknown> = {
    task: planData.action ?? "monitor",
    status: "awaiting_approval",
    details: planData,
    approval: {
      required: true,
      reason: `priority=${planData.priority}`,
    },
  };

  const decision = context.interrupt({ phase: "hold", execution: task });
  const approved = typeof decision === "string" ? decision === "approved" : Boolean(decision);
  task.status = approved ? "approved" : "rejected";
  (task.approval as Record<string, unknown>).decision = decision;
  return { phase: "hold", execution: task };
}

export function execute(state: SupplyState): Partial<SupplyState> {
  const planData = state.plan ?? {};
  const task: Record<string, unknown> = {
    task: planData.action ?? "monitor",
    status: "scheduled",
    details: planData,
    // Honest, not decorative: reflects whether a real OpenClaw runtime is
    // available for this dispatch or it is only simulated.
    dispatch_mode: openclawRuntimeStatus() === "ready" ? "openclaw" : "simulated",
  };

  if (task.task === "dispatch_surplus") {
    task.eta = "24h";
  } else if (task.task === "escalate_shortage") {
    task.escalation = "operations notified";
  }
  return { phase: "execute", execution: task };
}

/** Watch execution for disruption signals that force a re-plan. */
export function monitor(state: SupplyState): Partial<SupplyState> {
  const disruption =
    state.weather_risk === "high" ||
    state.weather_risk === "severe" ||
    state.logistics_status === "constrained";
  const canReplan = (state.replan_count ?? 0) < MAX_REPLANS;

  const result = {
    disruption_detected: disruption,
    will_replan: disruption && canReplan,
    checked_at: utcnowIso(),
  };

  const updates: Partial<SupplyState> = { phase: "monitor", monitor: result };
  if (result.will_replan) {
    updates.replan_count = (state.replan_count ?? 0) + 1;
    // Downgrade the signal so the re-plan converges instead of looping
    updates.logistics_status = "replanned";
  }
  return updates;
}

export function routeAfterMonitor(state: SupplyState): string {
  return state.monitor?.will_replan ? "assess" : "recover";
}

export function recover(state: SupplyState): Partial<SupplyState> {
  const decision = state.decision ?? "monitor";
  const executionStatus = state.execution?.status;

  const recovery: Record<string, unknown> = {
    recovery_action: decision === "monitor" ? "continue_monitoring" : "activate_followup",
    next_step: "observe_new_signals",
    replans_used: state.replan_count ?? 0,
  };

  if (executionStatus === "rejected") {
    recovery.recovery_action = "plan_rejected";
    recovery.next_step = "await_revised_plan";
  } else if (executionStatus === "approved") {
    recovery.recovery_action = "activate_followup";
    recovery.next_step = "notify_supply_chain_ops";
  } else if (decision === "trigger_shortage_response") {
    recovery.next_step = "notify_supply_chain_ops";
    recovery.feedback = "re-plan once updated demand and logistics signals arrive";
  }
  return { phase: "recover", recovery };
}

function buildGraph(): StateGraph<SupplyState> {
  const workflow = new StateGraph<SupplyState>();
  workflow.addNode("perceive", perceive);
  workflow.addNode("assess", assess);
  workflow.addNode("recommend", recommend);
  workflow.addNode("plan", plan);
  workflow.addNode("hold", holdForApproval);
  workflow.addNode("execute", execute);
  workflow.addNode("monitor", monitor);
  workflow.addNode("recover", recover);

  workflow.setEntryPoint("perceive");
  workflow.addEdge("perceive", "assess");
  workflow.addEdge("assess", "recommend");
  workflow.addEdge("recommend", "plan");
  workflow.addConditionalEdges("plan", needsApproval, { execute: "execute", hold: "hold" });
  workflow.addEdge("hold", "recover");
  workflow.addEdge("execute", "monitor");
  workflow.addConditionalEdges("monitor", routeAfterMonitor, {
    assess: "assess",
    recover: "recover",
  });
  // `recover` has no outgoing edge, so the run ends there.
  return workflow;
}

const globalGraph = globalThis as typeof globalThis & {
  __nexusGridGraph?: CompiledGraph<SupplyState>;
};

/**
 * Compile the workflow once with the in-memory checkpointer.
 *
 * Held on `globalThis` so paused threads stay resumable across hot reloads.
 */
export function getGraph(): CompiledGraph<SupplyState> {
  if (!globalGraph.__nexusGridGraph) {
    globalGraph.__nexusGridGraph = buildGraph().compile(new MemoryCheckpointer<SupplyState>());
    console.info("Workflow checkpointer: in-memory");
  }
  return globalGraph.__nexusGridGraph;
}
