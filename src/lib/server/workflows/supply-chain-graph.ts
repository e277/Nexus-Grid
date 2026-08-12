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

import { classifyGap, withSignalDefaults } from "./supply-rules";
import { utcnowIso } from "../time";
import { CompiledGraph, MemoryCheckpointer, StateGraph } from "./graph";
import { recommendAction } from "./language-step";
import { openclawRuntimeStatus } from "./llm-recommend";

const MAX_REPLANS = 1;
const RECOMMEND_ATTEMPTS = 3;

export interface SupplyState {
  // Incoming signal context — a sourcing gap observed in the trade data
  event?: string;
  commodity?: string | null;
  importer?: string | null;
  importer_iso3?: string | null;
  external_usd?: number;
  external_share_pct?: number;
  regional_suppliers?: string[] | string;
  climate_risk?: string;
  market_context?: string;
  require_approval?: boolean;
  // Derived along the workflow
  phase?: string;
  gap_severity?: string;
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
  /** What a human answered at the approval gate, if the run reached it. */
  gate_decision?: string;
  gate_note?: string;
}

export function perceive(state: SupplyState): Partial<SupplyState> {
  const normalized = withSignalDefaults(state);
  return {
    phase: "perceive",
    ...normalized,
    regional_suppliers: state.regional_suppliers,
    gap_severity: classifyGap(normalized.external_share_pct, normalized.external_usd),
    observed_at: utcnowIso(),
    replan_count: state.replan_count ?? 0,
  };
}

export function assess(state: SupplyState): Partial<SupplyState> {
  const severity = state.gap_severity ?? "minor";
  const suppliers = Array.isArray(state.regional_suppliers)
    ? state.regional_suppliers
    : [];

  let decision = "monitor";
  if (severity === "critical" && suppliers.length > 0) {
    decision = "coordinate_substitution";
  } else if (severity === "material" && suppliers.length > 0) {
    decision = "stagger_planting";
  } else if (severity !== "minor") {
    decision = "seek_regional_supply";
  }

  const rationale =
    `commodity=${state.commodity}, importer=${state.importer}, ` +
    `external=${state.external_share_pct}% ($${(state.external_usd ?? 0).toLocaleString()}), ` +
    `severity=${severity}, regional suppliers=${suppliers.length}`;

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
  const suppliers = Array.isArray(state.regional_suppliers) ? state.regional_suppliers : [];
  let planData: Record<string, unknown>;

  if (decision === "coordinate_substitution") {
    planData = {
      action: "open_regional_supply_line",
      priority: "urgent",
      target: "CARICOM trade coordination",
      strategy: `Route ${state.commodity} demand from ${state.importer} to ${suppliers.slice(0, 3).join(", ")}`,
      volume_at_stake_usd: state.external_usd,
      notification: { channel: "trade-coordination", severity: "high" },
    };
  } else if (decision === "stagger_planting") {
    planData = {
      action: "align_planting_windows",
      priority: "high",
      target: "ministries of agriculture",
      strategy: `Stagger ${state.commodity} planting between ${state.importer} and ${suppliers.slice(0, 3).join(", ")} so windows complement rather than overlap`,
      volume_at_stake_usd: state.external_usd,
    };
  } else if (decision === "seek_regional_supply") {
    planData = {
      action: "identify_regional_capacity",
      priority: "high",
      target: "agricultural research and extension",
      strategy: `No member state currently supplies ${state.commodity} into the region at volume — assess soil and climate suitability before committing`,
    };
  } else {
    planData = {
      action: "monitor",
      priority: "normal",
      target: "regional dashboard",
      instruction: "continue tracking trade, climate, and production signals",
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

/** What a human may answer at the gate. */
export const GATE_DECISIONS = ["approved", "modified", "rejected", "escalated"] as const;
export type GateDecision = (typeof GATE_DECISIONS)[number];

/** Normalize whatever the resume carried into a decision plus an operator note. */
function readDecision(value: unknown): { decision: GateDecision; note: string | null } {
  if (value && typeof value === "object") {
    const raw = value as { decision?: unknown; note?: unknown };
    const decision = GATE_DECISIONS.includes(raw.decision as GateDecision)
      ? (raw.decision as GateDecision)
      : "rejected";
    return {
      decision,
      note: typeof raw.note === "string" && raw.note.trim() ? raw.note.trim() : null,
    };
  }
  if (typeof value === "string") {
    return {
      decision: GATE_DECISIONS.includes(value as GateDecision)
        ? (value as GateDecision)
        : "rejected",
      note: null,
    };
  }
  // A bare truthy resume (an older client) still means "go ahead".
  return { decision: value ? "approved" : "rejected", note: null };
}

/**
 * Pause the graph for a real human decision.
 *
 * `interrupt()` throws on first entry, checkpointing state and halting the
 * run — the caller sees `status: awaiting_approval` with this task as the
 * payload. A client resumes via the same thread id (see
 * `orchestrator.resumeRun`), at which point this node re-runs from the top
 * and `interrupt()` returns the supplied decision instead of throwing again.
 *
 * Four answers, not two: an operator who would approve the plan *with an
 * amendment*, or who is not the right person to decide it, has nowhere to put
 * that in an approve/reject pair, and collapsing either into "approved" loses
 * the one piece of information the gate exists to capture.
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

  const { decision, note } = readDecision(context.interrupt({ phase: "hold", execution: task }));
  task.status = decision;
  const approval = task.approval as Record<string, unknown>;
  approval.decision = decision;
  approval.decided_at = utcnowIso();
  if (note) approval.note = note;
  return { phase: "hold", execution: task, gate_decision: decision, gate_note: note ?? undefined };
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
  // Live climate risk at the importing state is the disruption signal here:
  // a coordination plan agreed into a storm window is worth re-planning.
  const disruption = state.climate_risk === "high" || state.climate_risk === "severe";
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
    updates.climate_risk = "replanned";
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
    decision,
    replans_used: state.replan_count ?? 0,
  };

  if (executionStatus === "rejected") {
    recovery.recovery_action = "plan_rejected";
    recovery.next_step = "await_revised_plan";
  } else if (executionStatus === "escalated") {
    // Not a refusal — the decision was referred to someone with the standing
    // to make it, so the plan stays open rather than closing either way.
    recovery.recovery_action = "escalated_for_decision";
    recovery.next_step = "await_higher_authority";
  } else if (executionStatus === "modified") {
    recovery.recovery_action = "activate_followup";
    recovery.next_step = "notify_supply_chain_ops";
    if (state.gate_note) recovery.operator_amendment = state.gate_note;
  } else if (executionStatus === "approved") {
    recovery.recovery_action = "activate_followup";
    recovery.next_step = "notify_supply_chain_ops";
  } else if (decision !== "monitor") {
    recovery.next_step = "notify_regional_coordination";
    recovery.feedback = "re-plan once updated trade and production signals arrive";
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
  __nexusGridGraphV2?: CompiledGraph<SupplyState>;
};

/**
 * Compile the workflow once with the in-memory checkpointer.
 *
 * Held on `globalThis` so paused threads stay resumable across hot reloads. The
 * key carries a version because the node set has been replaced once: a stale
 * compiled graph would keep running the retired workflow after a reload.
 */
export function getGraph(): CompiledGraph<SupplyState> {
  if (!globalGraph.__nexusGridGraphV2) {
    globalGraph.__nexusGridGraphV2 = buildGraph().compile(new MemoryCheckpointer<SupplyState>());
    console.info("Workflow checkpointer: in-memory");
  }
  return globalGraph.__nexusGridGraphV2;
}
