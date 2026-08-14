"use client";

import { useEffect, useState } from "react";

import { cn } from "../../lib/utils";

import {
  Activity,
  ClipboardList,
  Lock,
  Radio,
  RefreshCw,
  Scale,
  Send,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import type { NodeState, NodeStatus } from "./model";
import {
  CANVAS,
  CARD,
  COLUMN,
  EDGES,
  LOOP_LANE,
  NODE_CENTER,
  PHASES,
  PHASE_OF_NODE,
  type EdgeSpec,
  type PhaseId,
} from "./phases";

const NODE_ICON: Record<string, LucideIcon> = {
  perceive: Radio,
  assess: Scale,
  recommend: Sparkles,
  plan: ClipboardList,
  hold: Lock,
  execute: Send,
  monitor: Activity,
  recover: RefreshCw,
};

const phaseVar = (id: PhaseId, suffix = "") => `var(--phase-${id}${suffix})`;

/** Break a summary into at most two lines — SVG text does not wrap. */
function wrap(text: string, maxChars: number, maxLines = 2): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (lines.length === maxLines) break;
    line = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
  }
  if (line && lines.length < maxLines) lines.push(line);

  // Anything left over is elided rather than clipped by the card.
  if (lines.length === maxLines) {
    const rendered = lines.join(" ");
    if (rendered.length < text.length) {
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,;:]?$/, "")}…`;
    }
  }
  return lines;
}

function edgeAnchors(edge: EdgeSpec) {
  const from = NODE_CENTER[edge.from];
  const to = NODE_CENTER[edge.to];
  const halfW = CARD.width / 2;
  const halfH = CARD.height / 2;

  // Leave from the side that faces the target, so a curve never starts
  // underneath its own card.
  if (from.x === to.x) {
    const down = to.y > from.y;
    return {
      start: { x: from.x, y: from.y + (down ? halfH : -halfH) },
      end: { x: to.x, y: to.y + (down ? -halfH : halfH) },
    };
  }
  return {
    start: { x: from.x + halfW, y: from.y },
    end: { x: to.x - halfW, y: to.y },
  };
}

/** Cubic with horizontal control handles — reads as a flow, not a corner. */
function edgePath(edge: EdgeSpec): { d: string; label: { x: number; y: number } } {
  if (edge.loop) {
    // The re-plan edge runs orthogonally through the gutter below the columns
    // so it reads as the loop it is, rather than a line crossing four phases.
    const from = NODE_CENTER[edge.from];
    const to = NODE_CENTER[edge.to];
    const bottom = from.y + CARD.height / 2;
    const lane = LOOP_LANE;
    // The gutter between the first two columns — the riser passes through it
    // rather than over a card.
    const riser = 258;
    const enter = to.x - CARD.width / 2;
    const r = 16;
    return {
      d:
        `M ${from.x} ${bottom} L ${from.x} ${lane - r} Q ${from.x} ${lane} ${from.x - r} ${lane} ` +
        `L ${riser + r} ${lane} Q ${riser} ${lane} ${riser} ${lane - r} ` +
        `L ${riser} ${to.y + r} Q ${riser} ${to.y} ${riser + r} ${to.y} L ${enter} ${to.y}`,
      label: { x: 700, y: lane },
    };
  }

  const { start, end } = edgeAnchors(edge);
  if (start.x === end.x) {
    return {
      d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
      label: { x: start.x, y: (start.y + end.y) / 2 },
    };
  }

  const dx = Math.max(28, (end.x - start.x) * 0.55);
  return {
    d: `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`,
    label: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
  };
}

const STATUS_STROKE: Record<NodeStatus, string> = {
  pending: "var(--color-border)",
  running: "",
  done: "var(--color-success-border)",
  skipped: "var(--color-border)",
};

export interface PipelineDiagramProps {
  nodes: Record<string, NodeState>;
  /** Node ids in the order the run executed them, repeats included. */
  trace: string[];
  /** `null` shows every phase; a phase id dims the rest. */
  focus: PhaseId | null;
  /** True while the run is parked at the approval gate. */
  awaitingApproval: boolean;
  /** Source label for the recommend → plan edge, once the model has answered. */
  modelSource?: string | null;
}

export function PipelineDiagram({
  nodes,
  trace,
  focus,
  awaitingApproval,
  modelSource,
}: PipelineDiagramProps) {
  /**
   * How long the step in flight has been running.
   *
   * Measured because the run is not evenly paced and pretending otherwise is
   * what made it look broken: perceive and assess land in under 100ms, then
   * `recommend` holds for twenty-odd seconds on the model call, then the last
   * four nodes finish in single milliseconds. Without a clock that pause is
   * indistinguishable from a hang, and the four instant steps flash past
   * before the eye can follow them.
   *
   * The timer restarts when the running node changes, so it always reads as
   * "this step has taken N", never as a total.
   */
  const runningId = Object.keys(nodes).find((id) => nodes[id]?.status === "running") ?? null;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (runningId === null) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(timer);
  }, [runningId]);

  const steps = new Map<string, number[]>();
  trace.forEach((id, index) => steps.set(id, [...(steps.get(id) ?? []), index + 1]));

  const traversed = new Set<string>();
  for (let i = 0; i < trace.length - 1; i += 1) {
    traversed.add(`${trace[i]}->${trace[i + 1]}`);
  }

  const phaseComplete = (id: PhaseId) => {
    const phase = PHASES.find((p) => p.id === id)!;
    const ran = phase.nodes.filter((n) => steps.has(n));
    return ran.length > 0 && ran.every((n) => nodes[n]?.status === "done");
  };

  const dim = (id: PhaseId) => (focus !== null && focus !== id ? 0.28 : 1);

  const runningNode = runningId ? nodes[runningId] : null;

  return (
    <>
    {/* Named, timed, and explained. The slow step is always the model call,
        and saying so turns a twenty-second wait from a stall into the one
        part of the run that is actually thinking. */}
    <div
      className={cn(
        "mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-3 py-2 text-ng-xs transition-colors",
        runningNode
          ? "border-ng-accent-bd bg-ng-accent-lit text-ng-primary"
          : "border-ng-border bg-ng-bg text-ng-secondary"
      )}
      aria-live="polite"
    >
      {runningNode ? (
        <>
          <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ng-accent opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ng-accent" />
          </span>
          <span className="font-semibold">{runningNode.label}</span>
          <span className="text-ng-secondary">{runningNode.desc}</span>
          <span className="ml-auto shrink-0 tabular-nums font-semibold text-ng-accent">
            {elapsed}s
          </span>
        </>
      ) : (
        <span>
          {trace.length > 0
            ? "Run complete — every step below is where the loop actually went."
            : "Idle. Start a sweep to watch the loop run."}
        </span>
      )}
    </div>

    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <svg
        viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Coordination loop: perceive, reason, plan, execute, recover, with a re-plan edge from monitor back to assess"
        className="h-auto w-full min-w-[880px]"
      >
        <defs>
          <marker
            id="ng-arrow-live"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {/* ── Phase columns ───────────────────────────────────────────── */}
        {PHASES.map((phase) => {
          const complete = phaseComplete(phase.id);
          const locked = phase.id === "execute" && awaitingApproval;
          return (
            <g key={phase.id} opacity={dim(phase.id)} style={{ transition: "opacity .2s" }}>
              <rect
                x={phase.x}
                y={COLUMN.top}
                width={COLUMN.width}
                height={COLUMN.height}
                rx={12}
                fill={phaseVar(phase.id, "-bg")}
                stroke={locked ? phaseVar(phase.id) : "var(--color-border)"}
                strokeWidth={locked ? 2 : 1}
              />
              <text
                x={phase.x + 16}
                y={COLUMN.top + 26}
                fill={phaseVar(phase.id, "-tx")}
                fontSize={13}
                fontWeight={700}
                letterSpacing={0.8}
              >
                {phase.label.toUpperCase()}
              </text>
              <text
                x={phase.x + 16}
                y={COLUMN.top + 46}
                fill="var(--color-text-secondary)"
                fontSize={12}
              >
                {phase.desc}
              </text>

              {/* Completion and the gate, as icons rather than colour alone. */}
              {complete ? (
                <g transform={`translate(${phase.x + COLUMN.width - 34}, ${COLUMN.top + 12})`}>
                  <circle cx={11} cy={11} r={11} fill="var(--color-success-bg)" />
                  <path
                    d="M 6 11.5 L 9.5 15 L 16 8"
                    fill="none"
                    stroke="var(--color-success)"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <title>{`${phase.label} complete`}</title>
                </g>
              ) : null}
              {locked ? (
                <g transform={`translate(${phase.x + COLUMN.width - 34}, ${COLUMN.top + 12})`}>
                  <circle cx={11} cy={11} r={11} fill={phaseVar(phase.id, "-bg")} />
                  <g transform="translate(3.5, 3.5)" color={phaseVar(phase.id, "-tx")}>
                    <Lock size={15} strokeWidth={2.4} />
                  </g>
                  <title>Awaiting human approval</title>
                </g>
              ) : null}
            </g>
          );
        })}

        {/* ── Edges ───────────────────────────────────────────────────── */}
        {EDGES.map((edge) => {
          const used = traversed.has(`${edge.from}->${edge.to}`);
          const targetPhase = PHASE_OF_NODE[edge.to];
          const { d } = edgePath(edge);
          // Not `used`: an edge is only in `traversed` once BOTH ends have
          // completed, because a node enters the trace when it finishes. The
          // edge feeding a node that is running right now therefore never
          // qualified, and the flow animation never once fired. What makes an
          // edge live is that its source finished and its target is working.
          const flowing =
            nodes[edge.from]?.status === "done" && nodes[edge.to]?.status === "running";
          const opacity = Math.min(dim(PHASE_OF_NODE[edge.from]), dim(targetPhase));
          const hue = edge.loop ? "var(--phase-recover)" : phaseVar(targetPhase);

          return (
            <g
              key={`${edge.from}->${edge.to}`}
              opacity={opacity}
              style={{ transition: "opacity .2s" }}
            >
              <path
                className={flowing ? "ng-edge-live" : undefined}
                d={d}
                fill="none"
                stroke={used ? hue : "var(--color-muted-border)"}
                strokeWidth={used ? 2 : 1.25}
                strokeOpacity={used ? 1 : 0.5}
                strokeLinecap="round"
                color={used ? hue : "var(--color-muted-border)"}
                markerEnd="url(#ng-arrow-live)"
              />

              {/* Particles travel only while the receiving node is running, so
                  motion means "this hop is happening now", not "this hop
                  exists". */}
              {flowing ? (
                <>
                  {/* Tail first, particles over it — the two together read as
                      motion in one direction rather than as a dotted line. */}
                  <path
                    className="ng-flow-tail"
                    d={d}
                    pathLength={1}
                    fill="none"
                    stroke={hue}
                    strokeWidth={6}
                    strokeOpacity={0.28}
                    aria-hidden
                  />
                  <path
                    className="ng-flow"
                    d={d}
                    pathLength={1}
                    fill="none"
                    stroke={hue}
                    strokeWidth={5.5}
                    aria-hidden
                  />
                </>
              ) : null}
            </g>
          );
        })}

        {/* ── Agent nodes ─────────────────────────────────────────────── */}
        {Object.entries(NODE_CENTER).map(([id, center]) => {
          const node = nodes[id];
          if (!node) return null;
          const phase = PHASE_OF_NODE[id];
          const Icon = NODE_ICON[id] ?? Radio;
          const ran = steps.get(id) ?? [];
          const running = node.status === "running";
          const x = center.x - CARD.width / 2;
          const y = center.y - CARD.height / 2;

          // The card always describes what the node *is*. It used to be
          // overwritten by that node's output on the last run, which turned a
          // map of the loop into a place to dump text: a 156px card cannot
          // hold a model's answer, so it arrived truncated mid-word and
          // carrying raw markdown, and the reader lost the one thing the
          // diagram is for — knowing what each step does. Run output belongs
          // in the results and approval panels, which have room for it.
          const body = node.status === "skipped" ? "Not on this run's path" : node.desc;
          // 132px of usable width at 10.5px ≈ 25 characters a line.
          const lines = wrap(body, 25, 3);

          return (
            <g
              key={id}
              opacity={
                dim(phase) * (node.status === "skipped" ? 0.55 : 1)
              }
              style={{ transition: "opacity .2s" }}
            >
              <rect
                x={x}
                y={y}
                width={CARD.width}
                height={CARD.height}
                rx={10}
                fill={running ? phaseVar(phase, "-bg") : "var(--color-surface)"}
                stroke={running ? phaseVar(phase) : STATUS_STROKE[node.status]}
                strokeWidth={running ? 2 : 1}
                strokeDasharray={node.status === "skipped" ? "5 4" : undefined}
                className={running ? "ng-node-pulse" : undefined}
              />

              <g transform={`translate(${x + 11}, ${y + 11})`} color={phaseVar(phase, "-tx")}>
                <Icon size={15} strokeWidth={2} />
              </g>

              <text
                x={x + 32}
                y={y + 22}
                fontSize={13}
                fontWeight={700}
                fill="var(--color-text-primary)"
              >
                {node.label}
              </text>

              {node.status === "done" ? (
                <path
                  d={`M ${x + CARD.width - 28} ${y + 16} L ${x + CARD.width - 23} ${y + 21} L ${x + CARD.width - 13} ${y + 10}`}
                  fill="none"
                  stroke="var(--color-success)"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : ran.length > 1 ? (
                <text
                  x={x + CARD.width - 11}
                  y={y + 21}
                  textAnchor="end"
                  fontSize={10}
                  fontWeight={700}
                  fill="var(--phase-recover-tx)"
                >
                  ×{ran.length}
                </text>
              ) : null}

              {lines.map((line, i) => (
                <text
                  key={i}
                  x={x + 11}
                  y={y + 41 + i * 14}
                  fontSize={10.5}
                  fill="var(--color-text-secondary)"
                >
                  {line}
                </text>
              ))}

              {/* The run's own summary is still reachable, on hover, without
                  it displacing the description on the face of the card. */}
              <title>
                {`${node.label} — ${node.status}${ran.length ? ` · step ${ran.join(", ")}` : ""}\n${node.desc}` +
                  (node.summary ? `\n\nThis run: ${node.summary}` : "")}
              </title>
            </g>
          );
        })}

        {/* ── Edge badges, drawn last ─────────────────────────────────────
            A badge sits at the midpoint between two cards. Drawn with the
            edges it would be painted over by the card that follows, which is
            what clipped every label on the first pass; drawn last it stays
            readable even where a long label runs past the gutter. */}
        {EDGES.map((edge) => {
          const used = traversed.has(`${edge.from}->${edge.to}`);
          const targetPhase = PHASE_OF_NODE[edge.to];
          const { label } = edgePath(edge);
          const opacity = Math.min(dim(PHASE_OF_NODE[edge.from]), dim(targetPhase));
          const hue = edge.loop ? "var(--phase-recover)" : phaseVar(targetPhase);
          const badge = edge.from === "recommend" && modelSource ? modelSource : edge.source;
          const badgeWidth = badge.length * 5.3 + 14;

          return (
            <g
              key={`badge-${edge.from}->${edge.to}`}
              opacity={opacity}
              style={{ transition: "opacity .2s" }}
            >
              <g transform={`translate(${label.x - badgeWidth / 2}, ${label.y - 9})`}>
                <rect
                  width={badgeWidth}
                  height={18}
                  rx={9}
                  fill="var(--color-surface)"
                  stroke={used ? hue : "var(--color-border)"}
                  strokeWidth={1}
                />
                <text
                  x={badgeWidth / 2}
                  y={12.5}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={600}
                  fill="var(--color-text-secondary)"
                >
                  {badge}
                </text>
              </g>

              {edge.label ? (
                <text
                  x={label.x}
                  y={label.y + 23}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="var(--color-text-secondary)"
                >
                  {edge.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
    </>
  );
}
