// Visual representation of the supply-chain workflow graph.
// Node ids below must match the graph's node names exactly, since
// `/api/workflow/trigger`'s `updates` entries are keyed by node name.

import type { SourceProvenance } from "../types";

export type NodeStatus = "pending" | "running" | "done" | "skipped";

export interface NodeState {
  id: string;
  label: string;
  desc: string;
  status: NodeStatus;
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

/**
 * The five phases of the control loop, and which graph nodes act in each.
 *
 * The grouping is presentational; the node ids are the real ones the graph
 * reports, so a card only lights up when that node actually ran.
 */
const PHASES: { id: string; label: string; desc: string; accent: string; nodes: string[] }[] = [
  {
    id: "perceive",
    label: "Perceive",
    desc: "Read signals",
    accent: "text-ng-warning-tx",
    nodes: ["perceive"],
  },
  {
    id: "reason",
    label: "Reason",
    desc: "Assess & recommend",
    accent: "text-ng-info-tx",
    nodes: ["assess", "recommend"],
  },
  {
    id: "plan",
    label: "Plan",
    desc: "Shape the action",
    accent: "text-ng-success-tx",
    nodes: ["plan"],
  },
  {
    id: "execute",
    label: "Execute",
    desc: "Dispatch or hold",
    accent: "text-ng-accent",
    nodes: ["hold", "execute"],
  },
  {
    id: "recover",
    label: "Recover",
    desc: "Watch & follow up",
    accent: "text-ng-danger-tx",
    nodes: ["monitor", "recover"],
  },
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
      return `Gap severity: ${data.gap_severity ?? "—"}`;
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

const SOURCE_STATUS_DOT: Record<SourceProvenance["status"], string> = {
  live: "bg-ng-success",
  cached: "bg-ng-info-tx",
  empty: "bg-ng-muted-bd",
  unauthorized: "bg-ng-warning",
  unavailable: "bg-ng-danger",
};

function NodeCard({ node }: { node: NodeState }) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-lg border px-2.5 py-2 transition-colors duration-200 ${STATUS_CARD[node.status]}`}
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
    <svg
      width="14"
      height="10"
      viewBox="0 0 16 10"
      fill="none"
      aria-hidden
      className="mt-9 hidden shrink-0 self-start text-ng-muted-bd lg:block"
    >
      <path
        d="M0 5H14M14 5L10 1M14 5L10 9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const LEGEND: { status: NodeStatus; label: string }[] = [
  { status: "pending", label: "Pending" },
  { status: "running", label: "Running" },
  { status: "done", label: "Done" },
  { status: "skipped", label: "Skipped" },
];

export function WorkflowPipeline({
  nodes,
  sources = [],
}: {
  nodes: Record<string, NodeState>;
  sources?: SourceProvenance[];
}) {
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

      {/* Phase columns. Each holds the real graph nodes that act in it, so a
          card only lights up when the graph reports that node ran. */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        {PHASES.map((phase, index) => (
          <div key={phase.id} className="flex min-w-0 flex-1 gap-1">
            <div className="min-w-0 flex-1 rounded-lg border border-ng-border bg-ng-bg p-2">
              <p className={`text-ng-2xs font-bold uppercase tracking-[.7px] ${phase.accent}`}>
                {phase.label}
              </p>
              <p className="mb-2 text-ng-2xs text-ng-secondary">{phase.desc}</p>
              <div className="space-y-1.5">
                {phase.nodes.map((id) =>
                  nodes[id] ? <NodeCard key={id} node={nodes[id]} /> : null
                )}
              </div>
            </div>
            {index < PHASES.length - 1 ? <Arrow /> : null}
          </div>
        ))}
      </div>

      {nodes.monitor?.status === "done" && nodes.monitor.summary?.includes("re-planning") ? (
        <p className="flex items-center gap-1.5 text-ng-xs font-medium text-ng-warning-tx">
          <span aria-hidden>↺</span>
          Disruption detected — monitor looped back to assess for a re-plan (max 1×)
        </p>
      ) : null}

      {sources.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-ng-border pt-2.5">
          <span className="text-ng-2xs font-semibold uppercase tracking-[.7px] text-ng-secondary">
            Data sources
          </span>
          {sources.map((source) => (
            <span
              key={`${source.publisher}-${source.endpoint}`}
              className="flex items-center gap-1.5 text-ng-2xs text-ng-secondary"
              title={`${source.status} · ${source.records.toLocaleString()} records`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${SOURCE_STATUS_DOT[source.status]}`}
              />
              {source.publisher}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
