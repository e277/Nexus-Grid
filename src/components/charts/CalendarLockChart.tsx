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
import type { SubstitutionOpportunity } from "../../types";
import { Skeleton } from "../ui/skeleton";
import { AXIS_PROPS, ChartFrame, compact, GRID_PROPS, INK, SERIES, TooltipShell } from "./chart-kit";

const MONTH_ORDER = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The nearest of `months` from the current calendar month.
 *
 * Mirrors `nearestUpcomingMonth` in the server's analysis.ts exactly — this
 * runs client-side against the same `picture` payload the findings text is
 * built from, rather than the server exposing a second endpoint for one
 * derived value.
 */
function nearestUpcomingMonth(months: string[]): { month: string; monthsAway: number } | null {
  const currentIndex = new Date().getMonth();
  let best: { month: string; monthsAway: number } | null = null;
  for (const m of months) {
    const idx = MONTH_ORDER.indexOf(m);
    if (idx === -1) continue;
    const monthsAway = (idx - currentIndex + 12) % 12;
    if (best === null || monthsAway < best.monthsAway) best = { month: m, monthsAway };
  }
  return best;
}

/**
 * Gaps where no regional supplier can start a rain-fed season on the
 * commodity this month — calendar-locked to external sourcing until a
 * specific future month.
 *
 * The same `regional_suppliers` list and rain-fed calendar the distribution
 * agent's own findings are built from; this only adds the chart the prose
 * had no equivalent of. A gap with no planting-calendar data for any
 * candidate supplier is left out rather than called "locked" — that is
 * missing data, not a timing claim.
 */
export function CalendarLockChart() {
  const { data } = usePoll(() => api.picture(), 60_000);

  if (!data) return <Skeleton className="h-64" />;

  const monthsByName = new Map(data.picture.states.map((s) => [s.name, s.rain_fed_months]));

  const rows = data.picture.substitution_opportunities
    .map((opportunity: SubstitutionOpportunity) => {
      const openMonths = new Set<string>();
      for (const supplier of opportunity.regional_suppliers) {
        for (const m of monthsByName.get(supplier) ?? []) openMonths.add(m);
      }
      if (openMonths.size === 0) return null;
      const nearest = nearestUpcomingMonth([...openMonths]);
      if (nearest === null || nearest.monthsAway === 0) return null;
      return {
        key: `${opportunity.importer_iso3}-${opportunity.commodity_code}`,
        label: `${opportunity.importer} · ${opportunity.commodity}`,
        monthsAway: nearest.monthsAway,
        nextOpenMonth: nearest.month,
        externalUsd: opportunity.external_usd,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.externalUsd - a.externalUsd);

  if (rows.length === 0) {
    return (
      <ChartFrame
        title="Calendar-locked to external sourcing"
        subtitle="None right now"
        variant="supporting"
      >
        <p className="py-6 text-center text-ng-sm text-ng-secondary">
          Every observed gap has at least one regional supplier able to start a rain-fed season
          on that commodity this month — a real reading, not a missing one.
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
          Opens <span className="font-medium text-ng-primary">{row.nextOpenMonth}</span> — no
          regional supplier can start a rain-fed season on this commodity before then
        </p>
        <p className="text-ng-xs text-ng-secondary">{compact(row.externalUsd)} currently bought outside the region</p>
      </TooltipShell>
    );
  }

  return (
    <ChartFrame
      title="Calendar-locked to external sourcing"
      subtitle={`${rows.length} gap${rows.length === 1 ? "" : "s"} where no regional supplier can start this month, biggest first — months until the nearest one can`}
      variant="supporting"
    >
      <div className="w-full" style={{ height: rows.length * 24 + 44 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 60, bottom: 20, left: 8 }}
            barCategoryGap="22%"
          >
            <CartesianGrid {...GRID_PROPS} horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              {...AXIS_PROPS}
              label={{
                value: "Months until a regional supplier can start",
                position: "insideBottom",
                offset: -4,
                fill: INK.secondary,
                fontSize: 11,
              }}
            />
            <YAxis type="category" dataKey="label" width={190} {...AXIS_PROPS} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-accent-light)" }} />
            <Bar dataKey="monthsAway" radius={[0, 4, 4, 0]} maxBarSize={16} fill={SERIES[1]}>
              <LabelList
                dataKey="nextOpenMonth"
                position="right"
                fill={INK.secondary}
                fontSize={11}
                fontWeight={600}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
