"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { SubstitutionOpportunity } from "../../types";
import { AXIS_PROPS, GRID_PROPS, INK, LEGEND_PROPS, SERIES, TooltipRow, TooltipShell, usd } from "./chart-kit";

interface Row {
  label: string;
  commodity: string;
  importer: string;
  intra: number;
  external: number;
  externalShare: number;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <TooltipShell title={`${row.importer} · ${row.commodity}`}>
      <TooltipRow color={SERIES[0]} name="Already from CARICOM" value={usd(row.intra)} />
      <TooltipRow color={SERIES[1]} name="From outside the region" value={usd(row.external)} />
      <p className="pt-0.5 text-ng-2xs text-ng-secondary">
        {row.externalShare}% of this commodity’s imports come from outside.
      </p>
    </TooltipShell>
  );
}

/**
 * Where each sourcing gap sits: how much is already bought inside the region
 * against how much still comes from outside it.
 *
 * Stacked because the two parts sum to that commodity's whole import bill for
 * that state, which is the comparison that matters — the external segment is
 * the size of the opportunity. A 2px surface gap separates the segments, so
 * the boundary reads without a stroke around either mark.
 */
export function GapChart({ opportunities }: { opportunities: SubstitutionOpportunity[] }) {
  const rows: Row[] = opportunities.slice(0, 10).map((o) => ({
    label: `${o.importer} · ${o.commodity}`,
    commodity: o.commodity,
    importer: o.importer,
    intra: o.intra_usd,
    external: o.external_usd,
    externalShare: Math.round(o.external_share_pct),
  }));

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-ng-sm text-ng-secondary">
        No sourcing gaps in the current trade snapshot.
      </p>
    );
  }

  return (
    <div className="w-full" style={{ height: rows.length * 42 + 72 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 20, bottom: 4, left: 8 }}
          barCategoryGap="30%"
        >
          <CartesianGrid {...GRID_PROPS} horizontal={false} />
          <XAxis type="number" tickFormatter={usd} {...AXIS_PROPS} />
          <YAxis type="category" dataKey="label" width={200} {...AXIS_PROPS} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-accent-light)" }} />
          <Legend {...LEGEND_PROPS} />
          <Bar
            dataKey="intra"
            name="Already from CARICOM"
            stackId="gap"
            fill={SERIES[0]}
            stroke={INK.surface}
            strokeWidth={2}
            maxBarSize={22}
          />
          <Bar
            dataKey="external"
            name="From outside the region"
            stackId="gap"
            fill={SERIES[1]}
            stroke={INK.surface}
            strokeWidth={2}
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
