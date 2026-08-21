"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { GapMatch } from "../../types";
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
 * How well the region can cover each gap, in one chart.
 *
 * One bar per gap, so the question this answers is a comparative one: which
 * gaps have a strong regional alternative and which do not. A chart per gap
 * cannot answer it — the reader would hold a score in their head while
 * scrolling to the next. The factor breakdown for the gap you pick sits
 * beside it.
 *
 * Sorted by score, not by trade value. The ranking is the agents' judgement and
 * that is what this plots; the dollar figure rides along in the tooltip as
 * context for a conclusion, not as a series of its own.
 */
export function SupplierCoverageChart({
  matches,
  selected,
  onSelect,
}: {
  matches: GapMatch[];
  /** `importer_iso3-commodity_code` of the gap whose breakdown is open. */
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const rows = matches
    .filter((match) => match.matches.length > 0)
    .map((match) => {
      const best = match.matches[0];
      return {
        key: `${match.importer_iso3}-${match.commodity_code}`,
        label: `${match.importer} · ${match.commodity}`,
        score: best.score,
        supplier: best.supplier,
        alternatives: match.matches.length,
        externalUsd: match.external_usd,
      };
    })
    .sort((a, b) => b.score - a.score);

  if (rows.length === 0) {
    return (
      <ChartFrame title="Regional coverage by gap" subtitle="No ranked suppliers yet" variant="supporting">
        <p className="py-6 text-center text-ng-sm text-ng-secondary">
          No gap has a scored regional supplier.
        </p>
      </ChartFrame>
    );
  }

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
          Best match{" "}
          <span className="font-medium text-ng-primary">{row.supplier}</span> at{" "}
          <span className="font-medium tabular-nums text-ng-primary">{row.score}/100</span>
        </p>
        <p className="text-ng-xs text-ng-secondary">
          {row.alternatives} regional supplier{row.alternatives === 1 ? "" : "s"} scored
        </p>
        <p className="text-ng-xs text-ng-secondary">
          {compact(row.externalUsd)} currently bought outside the region
        </p>
        <p className="pt-1 text-ng-2xs text-ng-secondary">Click for the factor breakdown</p>
      </TooltipShell>
    );
  }

  return (
    <ChartFrame
      title="Regional coverage by gap"
      subtitle={`Best regional supplier score for each of ${rows.length} gaps, strongest first — click a bar for its factor breakdown`}
      variant="supporting"
    >
      <div className="w-full" style={{ height: rows.length * 26 + 44 }}>
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
              domain={[0, 100]}
              {...AXIS_PROPS}
              label={{
                value: "Best match score out of 100",
                position: "insideBottom",
                offset: -4,
                fill: INK.secondary,
                fontSize: 11,
              }}
            />
            <YAxis type="category" dataKey="label" width={190} {...AXIS_PROPS} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-accent-light)" }} />
            <Bar
              dataKey="score"
              radius={[0, 4, 4, 0]}
              maxBarSize={16}
              stroke={INK.surface}
              strokeWidth={2}
              className="cursor-pointer"
              onClick={(data: { payload?: { key?: string } }) =>
                onSelect(selected === data?.payload?.key ? null : (data?.payload?.key ?? null))
              }
            >
              {/* One slot for every bar: the length already carries the
                  comparison, so colouring by rank would spend the identity
                  channel re-encoding it. The selected bar is held at full
                  strength and the rest recede. */}
              {rows.map((row) => (
                <Cell
                  key={row.key}
                  fill={SERIES[0]}
                  fillOpacity={selected && selected !== row.key ? 0.34 : 1}
                />
              ))}
              <LabelList dataKey="score" position="right" {...VALUE_LABEL} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
