/**
 * The coordination graph's node model, as the console understands it.
 *
 * Node ids must match the graph's node names exactly: `/api/workflow/trigger`
 * returns its `updates` entries keyed by node name, and the diagram lights a
 * card only when its own id shows up there. See
 * `src/lib/server/workflows/supply-chain-graph.ts`.
 */

export type NodeStatus = "pending" | "running" | "done" | "skipped";

export interface NodeState {
  id: string;
  label: string;
  desc: string;
  status: NodeStatus;
  /** One-line human summary of what this node actually returned. */
  summary?: string;
}

export const PIPELINE_NODES: { id: string; label: string; desc: string }[] = [
  { id: "perceive", label: "Perceive", desc: "Normalize the signal, classify gap severity" },
  { id: "assess", label: "Assess", desc: "Decide substitution / staggered planting / monitor" },
  { id: "recommend", label: "Recommend", desc: "LLM proposes a coordination action" },
  { id: "plan", label: "Plan", desc: "Turn the decision into a concrete plan" },
  { id: "execute", label: "Execute", desc: "Schedule the plan" },
  { id: "hold", label: "Hold", desc: "Urgent plan awaits human approval" },
  { id: "monitor", label: "Monitor", desc: "Watch for disruption; may trigger a re-plan" },
  { id: "recover", label: "Recover", desc: "Decide the follow-up step" },
];

export function buildInitialNodes(): Record<string, NodeState> {
  return Object.fromEntries(
    PIPELINE_NODES.map((n) => [n.id, { ...n, status: "pending" as NodeStatus }])
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Turn one `updates` entry's payload into a one-line human summary. */
export function summarizeUpdate(id: string, data: Record<string, unknown>): string {
  switch (id) {
    case "perceive":
      return `Gap severity: ${data.gap_severity ?? "—"}`;
    case "assess":
      return `Decision: ${String(data.decision ?? "—").replace(/_/g, " ")}`;
    case "recommend": {
      const rec = data.recommendation;
      if (rec && typeof rec === "object") {
        const r = rec as Record<string, unknown>;
        // The model answers against a schema now, so the one-line action is a
        // field rather than the first sentence of a paragraph.
        const action = typeof r.action === "string" ? r.action : "";
        return truncate(action, 120) || `[${r.source ?? "?"}] no action returned`;
      }
      return typeof rec === "string" ? rec : "—";
    }
    case "plan": {
      const plan = data.plan_data as Record<string, unknown> | undefined;
      return plan
        ? `${String(plan.action).replace(/_/g, " ")} · priority ${plan.priority}`
        : "—";
    }
    case "execute":
    case "hold": {
      const ex = data.execution as Record<string, unknown> | undefined;
      return ex ? `${String(ex.task).replace(/_/g, " ")} → ${ex.status}` : "—";
    }
    case "monitor": {
      const m = data.monitor_result as Record<string, unknown> | undefined;
      if (!m) return "—";
      return `Disruption: ${m.disruption_detected ? "yes" : "no"}${m.will_replan ? " · re-planning" : ""}`;
    }
    case "recover": {
      const r = data.recovery as Record<string, unknown> | undefined;
      return r
        ? `${String(r.recovery_action).replace(/_/g, " ")} → ${String(r.next_step).replace(/_/g, " ")}`
        : "—";
    }
    default:
      return "—";
  }
}
