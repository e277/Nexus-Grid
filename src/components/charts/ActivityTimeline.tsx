"use client";

import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import type { AgentActivity } from "../../types";
import { AXIS_PROPS, ChartFrame, GRID_PROPS, INK, SERIES, TooltipShell } from "./chart-kit";

interface Point {
  at: number;
  agent: string;
  action: string;
  confidence: number;
}

/**
 * When each agent acted, in one lane per agent.
 *
 * The table below answers "what happened", one row at a time. This answers the
 * question the table cannot: how the work is distributed and how it moves —
 * the supervisor delegating, the specialist answering, and the gaps where
 * nothing was worth doing.
 *
 * Time is the axis because the record is a sequence. Lanes are agents because
 * the interesting pattern is which agent follows which, and that is invisible
 * when every action is on one line.
 */
export function ActivityTimeline({ activities }: { activities: AgentActivity[] }) {
  const points: Point[] = activities
    .filter((a) => a.created_at)
    .map((a) => ({
      at: new Date(a.created_at as string).getTime(),
      agent: a.agent_title ?? a.agent_name,
      action: a.action_label ?? a.action,
      confidence: a.confidence ?? 0,
    }))
    .filter((p) => Number.isFinite(p.at));

  if (points.length === 0) return null;

  // Busiest first, so the lane a reader looks at first is the one with the
  // most in it.
  const agents = [...new Set(points.map((p) => p.agent))].sort(
    (a, b) =>
      points.filter((p) => p.agent === b).length - points.filter((p) => p.agent === a).length
  );

  const first = Math.min(...points.map((p) => p.at));
  const last = Math.max(...points.map((p) => p.at));
  const minutes = Math.max(1, Math.round((last - first) / 60_000));

  function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <TooltipShell title={p.agent}>
        <p className="text-ng-xs text-ng-secondary">{p.action}</p>
        <p className="text-ng-xs text-ng-secondary">
          {new Date(p.at).toLocaleTimeString()} ·{" "}
          <span className="tabular-nums text-ng-primary">
            {Math.round(p.confidence * 100)}%
          </span>{" "}
          confidence
        </p>
      </TooltipShell>
    );
  }

  return (
    <ChartFrame
      title="When each agent acted"
      subtitle={`${points.length} actions across ${agents.length} agents over ${minutes} minute${minutes === 1 ? "" : "s"} — one lane per agent, marker size is the confidence it recorded`}
    >
      <div className="w-full" style={{ height: agents.length * 34 + 56 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 20, bottom: 18, left: 8 }}>
            <CartesianGrid {...GRID_PROPS} vertical={false} />
            <XAxis
              type="number"
              dataKey="at"
              domain={[first, last]}
              {...AXIS_PROPS}
              tickFormatter={(v: number) =>
                new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              }
              label={{
                value: "Time recorded",
                position: "insideBottom",
                offset: -4,
                fill: INK.secondary,
                fontSize: 11,
              }}
            />
            <YAxis type="category" dataKey="agent" width={150} {...AXIS_PROPS} />
            {/* Confidence as area, bounded so a zero-confidence action is
                still a visible mark: it happened, and a scan that found
                nothing is as much a record as one that did. */}
            <ZAxis type="number" dataKey="confidence" range={[26, 150]} domain={[0, 1]} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: INK.grid }} />
            {agents.map((agent) => (
              <Scatter
                key={agent}
                name={agent}
                data={points.filter((p) => p.agent === agent)}
                fill={SERIES[0]}
                fillOpacity={0.55}
                stroke={INK.surface}
                strokeWidth={1}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
