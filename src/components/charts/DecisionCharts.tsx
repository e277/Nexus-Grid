"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AgentActivity } from "../../types";
import { AXIS_PROPS, GRID_PROPS, INK, LEGEND_PROPS, SERIES, TooltipRow, TooltipShell } from "./chart-kit";

export interface AgentStat {
  agent: string;
  decisions: number;
  meanConfidence: number | null;
}

/** Confidence buckets — an ordinal scale, so one hue, light → dark. */
const BANDS = [
  { label: "< 50%", min: 0, max: 0.5 },
  { label: "50–69%", min: 0.5, max: 0.7 },
  { label: "70–79%", min: 0.7, max: 0.8 },
  { label: "80–89%", min: 0.8, max: 0.9 },
  { label: "≥ 90%", min: 0.9, max: 1.01 },
];

/**
 * How confident the agents were, bucketed.
 *
 * Ordinal, not categorical: the buckets have a natural order, so they take one
 * hue stepped light → dark rather than five identities. A single measure per
 * bucket means no legend — the axis is the key.
 */
export function ConfidenceChart({ activities }: { activities: AgentActivity[] }) {
  const scored = activities.filter(
    (a): a is AgentActivity & { confidence: number } =>
      typeof a.confidence === "number" && Number.isFinite(a.confidence)
  );

  if (scored.length === 0) {
    return (
      <p className="py-6 text-center text-ng-sm text-ng-secondary">
        No agent decision has carried a confidence score yet.
      </p>
    );
  }

  const data = BANDS.map((band, i) => ({
    label: band.label,
    count: scored.filter((a) => a.confidence >= band.min && a.confidence < band.max).length,
    // Five monotone steps of the accent hue, lightest at the low end.
    fill: `color-mix(in oklab, var(--color-accent) ${28 + i * 18}%, var(--color-surface))`,
  }));

  function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: (typeof data)[number] }[] }) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <TooltipShell title={`Confidence ${row.label}`}>
        <p className="text-ng-xs text-ng-secondary">
          <span className="font-medium tabular-nums text-ng-primary">{row.count}</span> decision
          {row.count === 1 ? "" : "s"} · {Math.round((row.count / scored.length) * 100)}% of scored
        </p>
      </TooltipShell>
    );
  }

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid {...GRID_PROPS} vertical={false} />
          <XAxis dataKey="label" {...AXIS_PROPS} interval={0} />
          <YAxis allowDecimals={false} width={28} {...AXIS_PROPS} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-accent-light)" }} />
          <Bar
            dataKey="count"
            radius={[4, 4, 0, 0]}
            maxBarSize={44}
            stroke={INK.surface}
            strokeWidth={2}
            label={{ position: "top", fill: INK.secondary, fontSize: 10 }}
          >
            {data.map((row) => (
              <Cell key={row.label} fill={row.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Which agent did the deciding.
 *
 * Nominal categories, so every bar takes slot 1 rather than a colour each —
 * bar length already carries the comparison and the name is on the axis.
 */
export function AgentChart({ stats }: { stats: AgentStat[] }) {
  if (stats.length === 0) {
    return (
      <p className="py-6 text-center text-ng-sm text-ng-secondary">
        No agent has recorded a decision yet.
      </p>
    );
  }

  function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: AgentStat }[] }) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <TooltipShell title={row.agent}>
        <p className="text-ng-xs text-ng-secondary">
          <span className="font-medium tabular-nums text-ng-primary">{row.decisions}</span> decision
          {row.decisions === 1 ? "" : "s"}
        </p>
        <p className="text-ng-xs text-ng-secondary">
          Mean confidence{" "}
          <span className="font-medium tabular-nums text-ng-primary">
            {row.meanConfidence === null ? "—" : `${Math.round(row.meanConfidence * 100)}%`}
          </span>
        </p>
      </TooltipShell>
    );
  }

  return (
    <div className="w-full" style={{ height: stats.length * 36 + 48 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={stats}
          layout="vertical"
          margin={{ top: 4, right: 36, bottom: 4, left: 8 }}
          barCategoryGap="32%"
        >
          <CartesianGrid {...GRID_PROPS} horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...AXIS_PROPS} />
          <YAxis type="category" dataKey="agent" width={110} {...AXIS_PROPS} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-accent-light)" }} />
          <Bar
            dataKey="decisions"
            fill={SERIES[0]}
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
            stroke={INK.surface}
            strokeWidth={2}
            label={{ position: "right", fill: INK.secondary, fontSize: 10 }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface Slice {
  name: string;
  value: number;
  color: string;
}

/**
 * Part-to-whole at a glance, five slices at most.
 *
 * Gate outcomes wear status tokens, not the categorical palette: approved,
 * rejected and escalated *mean* good/bad, and a series colour standing in for
 * that would be the wrong channel. Each slice is also directly labelled with
 * its count, so the ring is never the only way to read the number.
 */
export function OutcomePie({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <p className="py-6 text-center text-ng-sm text-ng-secondary">
        No gate decision has been recorded yet.
      </p>
    );
  }

  const present = slices.filter((s) => s.value > 0);

  function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Slice }[] }) {
    if (!active || !payload?.length) return null;
    const slice = payload[0].payload;
    return (
      <TooltipShell title={slice.name}>
        <TooltipRow
          color={slice.color}
          name="Decisions"
          value={`${slice.value} · ${Math.round((slice.value / total) * 100)}%`}
        />
      </TooltipShell>
    );
  }

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Tooltip content={<ChartTooltip />} />
          <Legend {...LEGEND_PROPS} verticalAlign="bottom" height={32} />
          <Pie
            data={present}
            dataKey="value"
            nameKey="name"
            innerRadius="52%"
            outerRadius="80%"
            paddingAngle={2}
            stroke={INK.surface}
            strokeWidth={2}
            label={({ value }: { value?: number }) => String(value ?? "")}
            labelLine={false}
          >
            {present.map((slice) => (
              <Cell key={slice.name} fill={slice.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
