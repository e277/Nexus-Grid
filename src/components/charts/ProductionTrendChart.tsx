"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "../../api";
import { usePoll } from "../../hooks";
import { Skeleton } from "../ui/skeleton";
import {
  AXIS_PROPS,
  ChartFrame,
  GRID_PROPS,
  INK,
  TooltipShell,
  VALUE_LABEL,
} from "./chart-kit";

interface ProductionState {
  iso3: string;
  country: string;
  change_pct: number | null;
  covers: string | null;
  points: number;
}

/**
 * Which member states have grown their food output, and which have lost it.
 *
 * The World Bank food production index is an observed annual series, so this
 * is a measured change over a stated window — not a projection. A member state
 * losing output while importing the commodity its neighbour exports is the
 * clearest case the coordination loop exists to act on, and it is invisible in
 * any single year's figure.
 *
 * Polarity, so two poles and a zero rule: growth and decline are opposite, and
 * in a food-security console they genuinely mean good and bad. Every bar is
 * labelled with its own number, so the direction is never carried by colour
 * alone.
 */
export function ProductionTrendChart() {
  const { data } = usePoll(() => api.production(), 60_000);

  if (!data) return <Skeleton className="h-64" />;

  const rows = (data.production as ProductionState[])
    .filter((s) => s.change_pct !== null)
    .map((s) => ({ ...s, change_pct: s.change_pct as number }));

  if (rows.length === 0) return null;

  const covers = rows[0].covers ?? "the observed window";
  const gained = rows.filter((r) => r.change_pct > 0).length;

  function ChartTooltip({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: { payload: (typeof rows)[number] }[];
  }) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <TooltipShell title={row.country}>
        <p className="text-ng-xs text-ng-secondary">
          Food production index{" "}
          <span className="font-medium tabular-nums text-ng-primary">
            {row.change_pct > 0 ? "+" : ""}
            {row.change_pct}%
          </span>{" "}
          across {row.covers}
        </p>
        <p className="text-ng-xs text-ng-secondary">
          {row.points} observed annual readings · World Bank
        </p>
      </TooltipShell>
    );
  }

  return (
    <ChartFrame
      title="Food production, change over the observed series"
      subtitle={`World Bank food production index across ${covers} — ${gained} of ${rows.length} member states grew output. Measured, not projected`}
    >
      <div className="w-full" style={{ height: Math.max(160, rows.length * 26 + 44) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 44, bottom: 20, left: 8 }}
            barCategoryGap="22%"
          >
            <CartesianGrid {...GRID_PROPS} horizontal={false} />
            <XAxis
              type="number"
              {...AXIS_PROPS}
              tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`}
              label={{
                value: "Change in food production index",
                position: "insideBottom",
                offset: -4,
                fill: INK.secondary,
                fontSize: 11,
              }}
            />
            <YAxis type="category" dataKey="country" width={170} {...AXIS_PROPS} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-accent-light)" }} />
            {/* The midpoint of a diverging scale is nothing, so it is a rule
                rather than a hue. */}
            <ReferenceLine x={0} stroke={INK.grid} strokeWidth={1} />
            <Bar dataKey="change_pct" radius={2} maxBarSize={16} stroke={INK.surface} strokeWidth={2}>
              {rows.map((row) => (
                <Cell
                  key={row.iso3}
                  fill={row.change_pct >= 0 ? "var(--color-success)" : "var(--color-danger)"}
                />
              ))}
              <LabelList
                dataKey="change_pct"
                position="right"
                formatter={(value: unknown) =>
                  typeof value === "number" ? `${value > 0 ? "+" : ""}${value}%` : ""
                }
                {...VALUE_LABEL}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
