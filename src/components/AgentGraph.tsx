"use client";

import { cn } from "../lib/utils";
import type { NodeState, NodeStatus } from "./WorkflowPipeline";

/**
 * The coordination graph as a graph, not a pipeline.
 *
 * A left-to-right strip implies the loop runs once, in order. It does not: the
 * approval gate branches, and `monitor` can send a run back to `assess` to
 * re-plan, so a real trace looks like perceive → assess → recommend → plan →
 * execute → monitor → *assess* → … — the same node executing at more than one
 * step. Nodes here therefore carry the step numbers they ran at, and edges the
 * run actually traversed are drawn solid while the rest stay faint.
 *
 * Positions are on a 0–100 grid so the SVG edges and the absolutely-positioned
 * cards share one coordinate space.
 */

interface Point {
  x: number;
  y: number;
}

const POSITIONS: Record<string, Point> = {
  perceive: { x: 8, y: 22 },
  assess: { x: 30, y: 22 },
  recommend: { x: 52, y: 22 },
  plan: { x: 74, y: 22 },
  hold: { x: 92, y: 52 },
  execute: { x: 74, y: 78 },
  monitor: { x: 47, y: 78 },
  recover: { x: 16, y: 78 },
};

interface Edge {
  from: string;
  to: string;
  /** Drawn as a curve so a backward edge reads as a loop, not a crossing. */
  curve?: number;
  label?: string;
}

const EDGES: Edge[] = [
  { from: "perceive", to: "assess" },
  { from: "assess", to: "recommend" },
  { from: "recommend", to: "plan" },
  { from: "plan", to: "hold", label: "needs approval" },
  { from: "plan", to: "execute", label: "auto" },
  { from: "hold", to: "recover", curve: 26 },
  { from: "execute", to: "monitor" },
  { from: "monitor", to: "recover" },
  { from: "monitor", to: "assess", curve: -34, label: "re-plan" },
];

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
  skipped: "border-dashed border-ng-border bg-ng-bg opacity-50",
};

/** Curved path between two points; `curve` bows it away from the straight line. */
function path(from: Point, to: Point, curve = 0): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2 + curve;
  return `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;
}

export interface AgentGraphProps {
  nodes: Record<string, NodeState>;
  /** Node ids in the order the run executed them, repeats included. */
  trace: string[];
}

export function AgentGraph({ nodes, trace }: AgentGraphProps) {
  // Which step numbers each node ran at. A node with more than one is where
  // the loop went back on itself.
  const steps = new Map<string, number[]>();
  trace.forEach((id, index) => {
    steps.set(id, [...(steps.get(id) ?? []), index + 1]);
  });

  const traversed = new Set<string>();
  for (let i = 0; i < trace.length - 1; i += 1) {
    traversed.add(`${trace[i]}->${trace[i + 1]}`);
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full" style={{ aspectRatio: "5 / 2", minHeight: 260 }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          <defs>
            <marker
              id="ng-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>

          {EDGES.map((edge) => {
            const from = POSITIONS[edge.from];
            const to = POSITIONS[edge.to];
            const used = traversed.has(`${edge.from}->${edge.to}`);
            const backward = (edge.curve ?? 0) < 0;

            return (
              <path
                key={`${edge.from}->${edge.to}`}
                d={path(from, to, edge.curve)}
                fill="none"
                vectorEffect="non-scaling-stroke"
                markerEnd="url(#ng-arrow)"
                className={cn(
                  used
                    ? backward
                      ? "text-ng-warning"
                      : "text-ng-accent"
                    : "text-ng-muted-bd"
                )}
                stroke="currentColor"
                strokeWidth={used ? 1.8 : 1}
                strokeDasharray={backward ? "4 3" : undefined}
                opacity={used ? 1 : 0.45}
              />
            );
          })}
        </svg>

        {Object.entries(POSITIONS).map(([id, point]) => {
          const node = nodes[id];
          if (!node) return null;
          const ran = steps.get(id) ?? [];

          return (
            <div
              key={id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
            >
              <div
                className={cn(
                  "w-32 rounded-lg border px-2.5 py-2 transition-colors duration-200 sm:w-36",
                  STATUS_CARD[node.status]
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[node.status])}
                  />
                  <span className="truncate text-ng-sm font-semibold text-ng-primary">
                    {node.label}
                  </span>
                  {ran.length > 0 ? (
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded px-1 font-mono text-ng-2xs font-bold",
                        ran.length > 1
                          ? "bg-ng-warning-bg text-ng-warning-tx"
                          : "bg-ng-muted text-ng-muted-tx"
                      )}
                      title={
                        ran.length > 1
                          ? `Ran at steps ${ran.join(", ")} — the loop returned here`
                          : `Step ${ran[0]}`
                      }
                    >
                      {ran.join(",")}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 line-clamp-2 text-ng-2xs leading-snug text-ng-secondary">
                  {node.status === "skipped" ? "Not on this run's path" : (node.summary ?? node.desc)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* The order actually executed, repeats and all. */}
      {trace.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 border-t border-ng-border pt-2.5">
          <span className="mr-1 text-ng-2xs font-semibold uppercase tracking-[.7px] text-ng-secondary">
            Execution order
          </span>
          {trace.map((id, index) => {
            const repeated = (steps.get(id)?.length ?? 0) > 1;
            return (
              <span key={`${id}-${index}`} className="flex items-center gap-1">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-ng-2xs",
                    repeated
                      ? "bg-ng-warning-bg text-ng-warning-tx"
                      : "bg-ng-muted text-ng-muted-tx"
                  )}
                >
                  {index + 1} {nodes[id]?.label ?? id}
                </span>
                {index < trace.length - 1 ? (
                  <span className="text-ng-muted-bd" aria-hidden>
                    →
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
