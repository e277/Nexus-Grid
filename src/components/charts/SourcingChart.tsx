"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { StateProfile } from "../../types";

/**
 * Where each member state buys its food, split by whether the supplier is
 * inside CARICOM or outside it.
 *
 * The two-hue categorical pair is the design system's chart-1/chart-2 tokens,
 * validated for colour-vision separation (worst adjacent ΔE 24.7 protan,
 * 33.6 normal) against this surface. Identity is never carried by colour
 * alone — the legend is always present and the tooltip names both series.
 */

const INTRA_COLOR = "var(--chart-1)";
const EXTERNAL_COLOR = "var(--chart-2)";

interface Row {
  name: string;
  intra: number;
  external: number;
  total: number;
}

function usd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value}`;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const intraShare = row.total > 0 ? Math.round((row.intra / row.total) * 100) : 0;

  return (
    <div className="rounded-md border border-ng-border bg-ng-surface px-3 py-2 shadow-ng-md">
      <p className="text-[13px] font-semibold text-ng-primary">{row.name}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ng-secondary">
        <span
          className="h-2 w-2 shrink-0 rounded-[2px]"
          style={{ background: INTRA_COLOR }}
        />
        From CARICOM
        <span className="ml-auto pl-3 font-medium tabular-nums text-ng-primary">
          {usd(row.intra)} · {intraShare}%
        </span>
      </p>
      <p className="flex items-center gap-1.5 text-[12px] text-ng-secondary">
        <span
          className="h-2 w-2 shrink-0 rounded-[2px]"
          style={{ background: EXTERNAL_COLOR }}
        />
        From outside
        <span className="ml-auto pl-3 font-medium tabular-nums text-ng-primary">
          {usd(row.external)} · {100 - intraShare}%
        </span>
      </p>
    </div>
  );
}

export function SourcingChart({ states }: { states: StateProfile[] }) {
  const rows: Row[] = states
    .filter((s) => s.food_imports_usd > 0)
    .map((s) => {
      const total = s.food_imports_usd;
      const intra = Math.round((total * (s.intra_caricom_share_pct ?? 0)) / 100);
      return { name: s.name, intra, external: total - intra, total };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  if (rows.length === 0) {
    return (
      <p className="px-5 py-4 text-sm text-ng-secondary">
        No trade flows observed yet — refresh the sources.
      </p>
    );
  }

  return (
    <div className="w-full" style={{ height: rows.length * 38 + 60 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
          barCategoryGap="28%"
        >
          <CartesianGrid
            horizontal={false}
            stroke="var(--color-border)"
            strokeDasharray="2 3"
          />
          <XAxis
            type="number"
            tickFormatter={usd}
            stroke="var(--color-border)"
            tick={{ fill: "var(--color-text-secondary)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={140}
            stroke="var(--color-border)"
            tick={{ fill: "var(--color-text-secondary)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-accent-light)" }} />
          <Legend
            verticalAlign="top"
            align="left"
            height={28}
            iconType="square"
            iconSize={9}
            formatter={(value) => (
              <span className="text-[11px] text-ng-secondary">{value}</span>
            )}
          />
          {/* A 2px surface-coloured stroke keeps the two segments visually
              separated where they meet, so the boundary reads without relying
              on the hue difference alone. */}
          <Bar
            dataKey="intra"
            name="From CARICOM"
            stackId="sourcing"
            fill={INTRA_COLOR}
            stroke="var(--color-surface)"
            strokeWidth={2}
          />
          <Bar
            dataKey="external"
            name="From outside the region"
            stackId="sourcing"
            fill={EXTERNAL_COLOR}
            stroke="var(--color-surface)"
            strokeWidth={2}
            radius={[0, 4, 4, 0]}
          >
            {rows.map((row) => (
              <Cell key={row.name} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
