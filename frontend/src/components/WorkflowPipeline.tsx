// Visual representation of backend/app/workflows/supply_chain_graph.py.
// Node ids below must match the LangGraph node names exactly, since
// `/workflow/trigger`'s `updates` entries are keyed by node name.

export type NodeStatus = "pending" | "running" | "done" | "skipped";

export interface NodeState {
  id: string;
  label: string;
  desc: string;
  status: NodeStatus;
  summary?: string;
}

export const PIPELINE_NODES: { id: string; label: string; desc: string }[] = [
  { id: "perceive", label: "Perceive", desc: "Normalize the signal, classify supply risk" },
  { id: "assess", label: "Assess", desc: "Decide monitor / allocate surplus / shortage response" },
  { id: "recommend", label: "Recommend", desc: "MiniMax LLM proposes an action" },
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

function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/i, "").trim();
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Turn one `updates` entry's payload into a one-line human summary. */
export function summarizeUpdate(id: string, data: Record<string, unknown>): string {
  switch (id) {
    case "perceive":
      return `Supply risk: ${data.supply_risk ?? "—"}`;
    case "assess":
      return `Decision: ${data.decision ?? "—"}`;
    case "recommend": {
      const rec = data.recommendation;
      if (rec && typeof rec === "object") {
        const r = rec as Record<string, unknown>;
        const text = typeof r.recommendation === "string" ? stripThink(r.recommendation) : "";
        return `[${r.source ?? "?"}] ${truncate(text, 130)}`;
      }
      return typeof rec === "string" ? rec : "—";
    }
    case "plan": {
      const plan = data.plan as Record<string, unknown> | undefined;
      return plan ? `${plan.action} · priority ${plan.priority}` : "—";
    }
    case "execute":
    case "hold": {
      const ex = data.execution as Record<string, unknown> | undefined;
      return ex ? `${ex.task} → ${ex.status}` : "—";
    }
    case "monitor": {
      const m = data.monitor as Record<string, unknown> | undefined;
      if (!m) return "—";
      return `Disruption: ${m.disruption_detected ? "yes" : "no"}${m.will_replan ? " · re-planning" : ""}`;
    }
    case "recover": {
      const r = data.recovery as Record<string, unknown> | undefined;
      return r ? `${r.recovery_action} → ${r.next_step}` : "—";
    }
    default:
      return "—";
  }
}

const STATUS_DOT: Record<NodeStatus, string> = {
  pending: "bg-ng-muted-bd",
  running: "bg-ng-accent animate-pulse",
  done: "bg-ng-success",
  skipped: "bg-ng-muted-bd",
};

const STATUS_CARD: Record<NodeStatus, string> = {
  pending: "border-ng-border bg-ng-surface",
  running: "border-ng-accent bg-ng-accent-lit shadow-ng-sm",
  done: "border-ng-success-bd bg-ng-surface",
  skipped: "border-dashed border-ng-border bg-ng-bg opacity-60",
};

function NodeCard({ node, compact }: { node: NodeState; compact?: boolean }) {
  return (
    <div
      className={`flex w-32 shrink-0 flex-col gap-1 rounded-lg border px-2.5 transition-colors duration-200 sm:w-36 ${
        compact ? "py-1.5" : "py-2.5"
      } ${STATUS_CARD[node.status]}`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[node.status]}`} />
        <span className="text-ng-sm font-semibold text-ng-primary">{node.label}</span>
      </div>
      <p className="text-ng-2xs leading-snug text-ng-secondary">
        {node.status === "skipped" ? "Skipped this run" : (node.summary ?? node.desc)}
      </p>
    </div>
  );
}

function Arrow() {
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden className="shrink-0 text-ng-muted-bd">
      <path d="M0 5H14M14 5L10 1M14 5L10 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const LEGEND: { status: NodeStatus; label: string }[] = [
  { status: "pending", label: "Pending" },
  { status: "running", label: "Running" },
  { status: "done", label: "Done" },
  { status: "skipped", label: "Skipped" },
];

export function WorkflowPipeline({ nodes }: { nodes: Record<string, NodeState> }) {
  const spine = ["perceive", "assess", "recommend", "plan"];
  const branch = ["execute", "hold"];
  const tail = ["monitor", "recover"];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-ng-2xs text-ng-secondary">
        {LEGEND.map((l) => (
          <span key={l.status} className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[l.status]}`} />
            {l.label}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-y-3 gap-x-1">
        {spine.map((id) => (
          <div key={id} className="flex shrink-0 items-center gap-1">
            <NodeCard node={nodes[id]} />
            <Arrow />
          </div>
        ))}

        <div className="flex shrink-0 items-center gap-1">
          <div className="flex shrink-0 flex-col gap-1">
            {branch.map((id) => (
              <NodeCard key={id} node={nodes[id]} compact />
            ))}
          </div>
          <Arrow />
        </div>

        {tail.map((id, i) => (
          <div key={id} className="flex shrink-0 items-center gap-1">
            <NodeCard node={nodes[id]} />
            {i < tail.length - 1 ? <Arrow /> : null}
          </div>
        ))}
      </div>

      {nodes.monitor?.status === "done" && nodes.monitor.summary?.includes("re-planning") ? (
        <p className="flex items-center gap-1.5 text-ng-xs font-medium text-ng-warning-tx">
          <span aria-hidden>↺</span>
          Disruption detected — monitor looped back to assess for a re-plan (max 1×)
        </p>
      ) : null}
    </div>
  );
}
