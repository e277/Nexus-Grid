/**
 * Core supply-chain workflow graph, on LangGraph.
 *
 * Implements the roadmap control loop as a stateful graph:
 *
 *     perceive → assess → recommend → plan → (approval gate) → execute
 *         → monitor → recover
 *                  ↘ assess (re-plan once when a disruption is detected)
 *
 * This ran on a hand-rolled runtime until the checkpointer needed to outlive
 * the process. Rather than grow a second implementation of durable execution,
 * the graph now uses LangGraph, whose checkpointer abstraction is exactly that
 * — see `checkpointer.ts`. Node bodies are unchanged pure functions; only the
 * wiring and the state declaration moved.
 */

import {
  Annotation,
  END,
  interrupt,
  START,
  StateGraph,
  type CompiledStateGraph,
} from "@langchain/langgraph";

import { classifyGap, withSignalDefaults } from "./supply-rules";
import { utcnowIso } from "../time";
import { getCheckpointer } from "./checkpointer";
import { recommendAction } from "./language-step";
import { dispatchPlan, dispatchStatus } from "../dispatch/openclaw";

const MAX_REPLANS = 1;
const RECOMMEND_ATTEMPTS = 3;
/** First retry waits this long; the second waits twice it. */
const RETRY_BASE_MS = 1_000;
const RETRY_JITTER_MS = 400;

/**
 * Shared state. Every channel is last-write-wins: nodes return the keys they
 * changed and the runtime merges them, which is the same contract the nodes
 * were written against.
 */
export const SupplyAnnotation = Annotation.Root({
  // Incoming signal context — a sourcing gap observed in the trade data
  event: Annotation<string | undefined>,
  commodity: Annotation<string | null | undefined>,
  importer: Annotation<string | null | undefined>,
  importer_iso3: Annotation<string | null | undefined>,
  external_usd: Annotation<number | undefined>,
  external_share_pct: Annotation<number | undefined>,
  regional_suppliers: Annotation<string[] | string | undefined>,
  climate_risk: Annotation<string | undefined>,
  market_context: Annotation<string | undefined>,
  require_approval: Annotation<boolean | undefined>,
  // Derived along the workflow
  phase: Annotation<string | undefined>,
  gap_severity: Annotation<string | undefined>,
  observed_at: Annotation<string | undefined>,
  decision: Annotation<string | undefined>,
  decision_rationale: Annotation<string | undefined>,
  rationale: Annotation<string | undefined>,
  recommendation: Annotation<unknown>,
  source: Annotation<string | undefined>,
  plan_data: Annotation<Record<string, unknown> | undefined>,
  execution: Annotation<Record<string, unknown> | undefined>,
  monitor_result: Annotation<Record<string, unknown> | undefined>,
  recovery: Annotation<Record<string, unknown> | undefined>,
  replan_count: Annotation<number | undefined>,
  /** What a human answered at the approval gate, if the run reached it. */
  gate_decision: Annotation<string | undefined>,
  gate_note: Annotation<string | undefined>,
  /** Thread id, so the execute node can key an idempotent dispatch. */
  thread_id: Annotation<string | undefined>,
});

export type SupplyState = typeof SupplyAnnotation.State;
export type SupplyUpdate = typeof SupplyAnnotation.Update;

export function perceive(state: SupplyState): SupplyUpdate {
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

export function assess(state: SupplyState): SupplyUpdate {
  const severity = state.gap_severity ?? "minor";
  const suppliers = Array.isArray(state.regional_suppliers) ? state.regional_suppliers : [];

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

  return { phase: "assess", decision, decision_rationale: rationale, rationale };
}

export async function recommend(state: SupplyState): Promise<SupplyUpdate> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= RECOMMEND_ATTEMPTS; attempt += 1) {
    try {
      return await recommendAction(state);
    } catch (error) {
      lastError = error;
      console.warn(`recommend attempt ${attempt}/${RECOMMEND_ATTEMPTS} failed:`, error);

      // Back off before trying again. The common failure here is a provider
      // rate limit, and answering one by immediately sending two more is the
      // shape most likely to extend it. Jittered so retries from separate
      // runs do not line up.
      if (attempt < RECOMMEND_ATTEMPTS) {
        const backoffMs = RETRY_BASE_MS * 2 ** (attempt - 1);
        await new Promise((resolve) =>
          setTimeout(resolve, backoffMs + Math.random() * RETRY_JITTER_MS)
        );
      }
    }
  }
  return {
    phase: "recommend",
    recommendation: {
      source: "error",
      action: "Recommendation unavailable after retries.",
      rationale: "",
      confidence: null,
      risks: [],
      structured: false,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    },
  };
}

export function plan(state: SupplyState): SupplyUpdate {
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
  return { phase: "plan", plan_data: planData };
}

/** Approval gate: urgent plans go to a human unless pre-approved. */
export function needsApproval(state: SupplyState): string {
  const priority = (state.plan_data ?? {}).priority as string | undefined;
  if (state.require_approval && (priority === "high" || priority === "urgent")) return "hold";
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
      decision: GATE_DECISIONS.includes(value as GateDecision) ? (value as GateDecision) : "rejected",
      note: null,
    };
  }
  // A bare truthy resume (an older client) still means "go ahead".
  return { decision: value ? "approved" : "rejected", note: null };
}

/**
 * Pause the graph for a real human decision.
 *
 * `interrupt()` halts the run on first entry, checkpointing the state before
 * this node — the caller sees `awaiting_approval` with this task as the
 * payload. Resuming the same thread re-runs the node from the top, and
 * `interrupt()` returns the supplied decision instead of halting.
 *
 * Four answers, not two: an operator who would approve the plan *with an
 * amendment*, or who is not the right person to decide it, has nowhere to put
 * that in an approve/reject pair, and collapsing either into "approved" loses
 * the one piece of information the gate exists to capture.
 */
export function holdForApproval(state: SupplyState): SupplyUpdate {
  const planData = state.plan_data ?? {};
  const task: Record<string, unknown> = {
    task: planData.action ?? "monitor",
    status: "awaiting_approval",
    details: planData,
    approval: { required: true, reason: `priority=${planData.priority}` },
  };

  const { decision, note } = readDecision(interrupt({ phase: "hold", execution: task }));

  task.status = decision;
  const approval = task.approval as Record<string, unknown>;
  approval.decision = decision;
  approval.decided_at = utcnowIso();
  if (note) approval.note = note;

  return { phase: "hold", execution: task, gate_decision: decision, gate_note: note ?? undefined };
}

/**
 * Dispatch the plan.
 *
 * Only an approved or amended plan is actually delivered — a rejected or
 * escalated one is a decision not to act, and sending it to a ministry desk
 * anyway would be the opposite of what the gate is for.
 */
export async function execute(state: SupplyState): Promise<SupplyUpdate> {
  const planData = state.plan_data ?? {};
  const gate = state.gate_decision ?? null;
  const deliverable = gate === null || gate === "approved" || gate === "modified";

  const dispatch = deliverable
    ? await dispatchPlan({
        plan: planData,
        decision: gate,
        note: state.gate_note ?? null,
        threadId: state.thread_id ?? "unknown",
      })
    : {
        mode: "simulated" as const,
        status: "skipped" as const,
        detail: `Not delivered — the plan was ${gate} at the approval gate.`,
      };

  const task: Record<string, unknown> = {
    task: planData.action ?? "monitor",
    // What execution did, which is not what the human said: the gate's answer
    // is `gate_decision` and stays there. A plan the gate refused was never
    // scheduled, and calling it "scheduled" because it passed through this
    // node would be the one status an operator must not misread.
    status: deliverable ? "scheduled" : "not_executed",
    details: planData,
    // Honest, not decorative: says whether a real gateway took this, or
    // whether there was nowhere to send it.
    dispatch_mode: dispatch.mode,
    dispatch_status: dispatch.status,
    dispatch_channel: dispatchStatus(),
  };
  if (dispatch.target) task.dispatch_target = dispatch.target;
  if (dispatch.detail) task.dispatch_detail = dispatch.detail;

  return { phase: "execute", execution: task };
}

/** Watch execution for disruption signals that force a re-plan. */
export function monitor(state: SupplyState): SupplyUpdate {
  // Live climate risk at the importing state is the disruption signal here:
  // a coordination plan agreed into a storm window is worth re-planning.
  const disruption = state.climate_risk === "high" || state.climate_risk === "severe";
  const canReplan = (state.replan_count ?? 0) < MAX_REPLANS;

  const result = {
    disruption_detected: disruption,
    will_replan: disruption && canReplan,
    checked_at: utcnowIso(),
  };

  const updates: SupplyUpdate = { phase: "monitor", monitor_result: result };
  if (result.will_replan) {
    updates.replan_count = (state.replan_count ?? 0) + 1;
    // Downgrade the signal so the re-plan converges instead of looping
    updates.climate_risk = "replanned";
  }
  return updates;
}

export function routeAfterMonitor(state: SupplyState): string {
  return state.monitor_result?.will_replan ? "assess" : "recover";
}

export function recover(state: SupplyState): SupplyUpdate {
  const decision = state.decision ?? "monitor";
  // The gate's own channel, not `execution.status`. They were the same field
  // while `hold` ran last and wrote the decision into the execution record;
  // now that an approved plan goes on to `execute`, that record describes the
  // dispatch and the gate's answer lives only here.
  const gate = state.gate_decision ?? null;

  const recovery: Record<string, unknown> = {
    recovery_action: decision === "monitor" ? "continue_monitoring" : "activate_followup",
    next_step: "observe_new_signals",
    decision,
    replans_used: state.replan_count ?? 0,
  };

  if (gate === "rejected") {
    recovery.recovery_action = "plan_rejected";
    recovery.next_step = "await_revised_plan";
  } else if (gate === "escalated") {
    // Not a refusal — the decision was referred to someone with the standing
    // to make it, so the plan stays open rather than closing either way.
    recovery.recovery_action = "escalated_for_decision";
    recovery.next_step = "await_higher_authority";
  } else if (gate === "modified") {
    recovery.recovery_action = "activate_followup";
    recovery.next_step = "notify_supply_chain_ops";
    if (state.gate_note) recovery.operator_amendment = state.gate_note;
  } else if (gate === "approved") {
    recovery.recovery_action = "activate_followup";
    recovery.next_step = "notify_supply_chain_ops";
  } else if (decision !== "monitor") {
    recovery.next_step = "notify_regional_coordination";
    recovery.feedback = "re-plan once updated trade and production signals arrive";
  }

  // A plan that was decided but could not be delivered is a follow-up in its
  // own right, and the operator should not have to infer that from a badge.
  if (state.execution?.dispatch_status === "failed") {
    recovery.delivery_failed = state.execution.dispatch_detail ?? true;
    recovery.next_step = "retry_delivery";
  }

  return { phase: "recover", recovery };
}

export function buildGraph() {
  return new StateGraph(SupplyAnnotation)
    .addNode("perceive", perceive)
    .addNode("assess", assess)
    .addNode("recommend", recommend)
    .addNode("plan", plan)
    .addNode("hold", holdForApproval)
    .addNode("execute", execute)
    .addNode("monitor", monitor)
    .addNode("recover", recover)
    .addEdge(START, "perceive")
    .addEdge("perceive", "assess")
    .addEdge("assess", "recommend")
    .addEdge("recommend", "plan")
    .addConditionalEdges("plan", needsApproval, { execute: "execute", hold: "hold" })
    .addEdge("hold", "execute")
    .addEdge("execute", "monitor")
    .addConditionalEdges("monitor", routeAfterMonitor, { assess: "assess", recover: "recover" })
    .addEdge("recover", END);
}

type CompiledSupplyGraph = ReturnType<ReturnType<typeof buildGraph>["compile"]>;

const globalGraph = globalThis as typeof globalThis & {
  __nexusGridGraphV3?: CompiledSupplyGraph;
};

/**
 * Compile the workflow once against the shared checkpointer.
 *
 * Held on `globalThis` so paused threads stay resumable across hot reloads.
 * The key carries a version because the runtime beneath it has been replaced:
 * a stale compiled graph would keep serving the retired implementation.
 */
export function getGraph(): CompiledSupplyGraph {
  if (!globalGraph.__nexusGridGraphV3) {
    globalGraph.__nexusGridGraphV3 = buildGraph().compile({ checkpointer: getCheckpointer() });
  }
  return globalGraph.__nexusGridGraphV3;
}

export type { CompiledStateGraph };
