"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AXIS_PROPS, GRID_PROPS, INK, SERIES, TooltipShell } from "./chart-kit";

export interface CoveragePoint {
  month: string;
  states: number;
  names: string[];
}

/**
 * How many member states can start a rain-fed season in each month.
 *
 * A single series, so no legend box — the title says what is plotted. The one
 * comparison that matters is against the regional mean, which is drawn as a
 * reference line: months below it are where the region has no one planting,
 * and those are the months a coordinated calendar is meant to fill.
 *
 * Bars are one colour, not a value ramp: the height already encodes the count,
 * and colouring by it would spend the identity channel twice. The thinnest
 * months are called out by a direct label instead.
 */
export function CoverageChart({ points }: { points: CoveragePoint[] }) {
  if (points.length === 0) {
    return (
      <p className="py-6 text-center text-ng-sm text-ng-secondary">
        No planting calendars available — NASA POWER returned no coverage.
      </p>
    );
  }

  const mean = points.reduce((sum, p) => sum + p.states, 0) / points.length;
  const min = Math.min(...points.map((p) => p.states));

  function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: CoveragePoint }[] }) {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload;
    return (
      <TooltipShell title={point.month}>
        <p className="text-ng-xs text-ng-secondary">
          <span className="font-medium tabular-nums text-ng-primary">{point.states}</span> state
          {point.states === 1 ? "" : "s"} can plant rain-fed
        </p>
        {point.names.length > 0 ? (
          <p className="max-w-[220px] text-ng-2xs leading-snug text-ng-secondary">
            {point.names.join(", ")}
          </p>
        ) : null}
      </TooltipShell>
    );
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 20, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid {...GRID_PROPS} vertical={false} />
          <XAxis dataKey="month" {...AXIS_PROPS} interval={0} />
          <YAxis allowDecimals={false} {...AXIS_PROPS} width={28} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-accent-light)" }} />
          <ReferenceLine
            y={mean}
            stroke={INK.secondary}
            strokeWidth={1}
            label={{
              value: `regional mean ${mean.toFixed(1)}`,
              position: "insideTopRight",
              fill: INK.secondary,
              fontSize: 10,
            }}
          />
          <Bar
            dataKey="states"
            fill={SERIES[0]}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            stroke={INK.surface}
            strokeWidth={2}
            // Only the thinnest months get a number on the cap — a value on
            // every bar is noise, and the axis carries the rest.
            label={{
              position: "top",
              fill: INK.secondary,
              fontSize: 10,
              formatter: (value: unknown) => (Number(value) === min ? String(value) : ""),
            }}
          >
            {points.map((point) => (
              <Cell key={point.month} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
