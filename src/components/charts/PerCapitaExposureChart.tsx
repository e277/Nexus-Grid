"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
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
  compact,
  GRID_PROPS,
  INK,
  SERIES,
  TooltipShell,
  VALUE_LABEL,
} from "./chart-kit";

/**
 * How exposed each member state is to food imports, per resident.
 *
 * Total import dollars favours the largest economies; dividing by population
 * is what makes a small, import-heavy state visible next to a large one that
 * imports more in absolute terms but feeds far more people from it. An
 * exposure proxy, not a risk score — it says nothing about a state's ability
 * to absorb the cost, only the scale of what it would need to absorb.
 */
export function PerCapitaExposureChart() {
  const { data } = usePoll(() => api.picture(), 60_000);

  if (!data) return <Skeleton className="h-64" />;

  const rows = data.picture.states
    .filter((s) => (s.population ?? 0) > 0 && s.food_imports_usd > 0)
    .map((s) => ({
      key: s.iso3,
      label: s.name,
      usdPerCapita: Math.round(s.food_imports_usd / (s.population as number)),
      totalUsd: s.food_imports_usd,
      population: s.population as number,
    }))
    .sort((a, b) => b.usdPerCapita - a.usdPerCapita);

  if (rows.length === 0) return null;

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
      <TooltipShell title={row.label}>
        <p className="text-ng-xs text-ng-secondary">
          <span className="font-medium text-ng-primary">{compact(row.usdPerCapita)}</span> in food
          imports per resident
        </p>
        <p className="text-ng-xs text-ng-secondary">
          {compact(row.totalUsd)} total, {row.population.toLocaleString()} residents
        </p>
      </TooltipShell>
    );
  }

  return (
    <ChartFrame
      title="Food-import exposure per resident"
      subtitle={`${rows.length} member states with observed population and import data, most exposed first`}
      variant="supporting"
    >
      <div className="w-full" style={{ height: rows.length * 24 + 44 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 48, bottom: 20, left: 8 }}
            barCategoryGap="22%"
          >
            <CartesianGrid {...GRID_PROPS} horizontal={false} />
            <XAxis
              type="number"
              {...AXIS_PROPS}
              tickFormatter={compact}
              label={{
                value: "USD per resident, per year",
                position: "insideBottom",
                offset: -4,
                fill: INK.secondary,
                fontSize: 11,
              }}
            />
            <YAxis type="category" dataKey="label" width={190} {...AXIS_PROPS} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-accent-light)" }} />
            <Bar dataKey="usdPerCapita" radius={[0, 4, 4, 0]} maxBarSize={16} fill={SERIES[0]}>
              <LabelList
                dataKey="usdPerCapita"
                position="right"
                formatter={(value: unknown) => (typeof value === "number" ? compact(value) : "")}
                {...VALUE_LABEL}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
