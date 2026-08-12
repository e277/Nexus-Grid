"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Lane } from "../../types";
import { AXIS_PROPS, GRID_PROPS, INK, SERIES, TooltipShell, usd } from "./chart-kit";

interface Row {
  label: string;
  hours: number;
  km: number | null;
  value: number;
  status: Lane["status"];
}

/**
 * Transit time on each lane a coordination plan would use.
 *
 * One series, so no legend — the axis and title carry it. Sorted by transit
 * rather than by value so the chart answers "which of these is actually
 * quick to move on", which is the question the ranking by money already
 * answers elsewhere on the page.
 */
export function LaneChart({ lanes }: { lanes: Lane[] }) {
  const rows: Row[] = lanes
    .slice(0, 12)
    .map((lane) => ({
      label: `${lane.supplier} → ${lane.importer}`,
      hours: lane.transit_hours,
      km: lane.distance_km,
      value: lane.external_usd,
      status: lane.status,
    }))
    // Collapse duplicate pairs: the same lane can carry several commodities
    // and the transit estimate is a property of the route, not the cargo.
    .filter((row, i, all) => all.findIndex((r) => r.label === row.label) === i)
    .sort((a, b) => a.hours - b.hours);

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-ng-sm text-ng-secondary">
        No lanes derived — there are no substitution opportunities to route.
      </p>
    );
  }

  function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <TooltipShell title={row.label}>
        <p className="text-ng-xs text-ng-secondary">
          <span className="font-medium tabular-nums text-ng-primary">{row.hours}h</span> estimated
          transit{row.km !== null ? ` over ${Math.round(row.km)} km` : ""}
        </p>
        <p className="text-ng-xs text-ng-secondary">
          Could displace{" "}
          <span className="font-medium tabular-nums text-ng-primary">{usd(row.value)}</span> of
          external sourcing
        </p>
        <p className="pt-0.5 text-ng-2xs text-ng-secondary">
          Geometry estimate, not a carrier quote.
        </p>
      </TooltipShell>
    );
  }

  return (
    <div className="w-full" style={{ height: rows.length * 34 + 56 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 44, bottom: 4, left: 8 }}
          barCategoryGap="32%"
        >
          <CartesianGrid {...GRID_PROPS} horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(value: number) => `${value}h`}
            {...AXIS_PROPS}
          />
          <YAxis type="category" dataKey="label" width={210} {...AXIS_PROPS} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-accent-light)" }} />
          <Bar
            dataKey="hours"
            fill={SERIES[0]}
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            stroke={INK.surface}
            strokeWidth={2}
            label={{
              position: "right",
              fill: INK.secondary,
              fontSize: 10,
              formatter: (value: unknown) => `${value}h`,
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
