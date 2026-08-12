"use client";

import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import type { StateProfile } from "../../types";
import { INK, LEGEND_PROPS, SERIES, TooltipRow, TooltipShell } from "./chart-kit";

const AXES = [
  { key: "arable", label: "Arable land" },
  { key: "agriLand", label: "Agri. land" },
  { key: "yield", label: "Cereal yield" },
  { key: "valueAdded", label: "Agri. % of GDP" },
  { key: "window", label: "Rain-fed months" },
] as const;

type AxisKey = (typeof AXES)[number]["key"];

function raw(state: StateProfile): Record<AxisKey, number | null> {
  return {
    arable: state.arable_land_pct,
    agriLand: state.agricultural_land_pct,
    yield: state.cereal_yield_kg_ha,
    valueAdded: state.agriculture_value_added_pct,
    window: state.rain_fed_months.length,
  };
}

/**
 * Regional production capability, three states at a time.
 *
 * Each axis is indexed 0–100 against the regional maximum for that indicator,
 * because the underlying units (percent, kg/ha, months) share no scale — a
 * radar drawn on the raw numbers would be one indicator's shape. The tooltip
 * always shows the real value alongside the index, so the normalisation never
 * hides what was measured.
 *
 * Capped at three series: overlaid radars put any two fills side by side, so
 * the all-pairs colour-separation gate applies, and the palette clears it with
 * three slots, not more.
 */
export function CapabilityRadar({ states }: { states: StateProfile[] }) {
  const covered = states.filter((s) => {
    const values = raw(s);
    return AXES.filter((axis) => values[axis.key] !== null).length >= 3;
  });

  // Rank by how much of the region's food import bill they could address —
  // the states worth comparing are the ones already trading at volume.
  const chosen = [...covered].sort((a, b) => b.food_imports_usd - a.food_imports_usd).slice(0, 3);

  if (chosen.length === 0) {
    return (
      <p className="py-6 text-center text-ng-sm text-ng-secondary">
        No member state has enough indicator coverage to chart yet.
      </p>
    );
  }

  const max: Record<AxisKey, number> = Object.fromEntries(
    AXES.map((axis) => [
      axis.key,
      Math.max(...covered.map((s) => raw(s)[axis.key] ?? 0), 1),
    ])
  ) as Record<AxisKey, number>;

  const data = AXES.map((axis) => {
    const point: Record<string, string | number> = { axis: axis.label };
    for (const state of chosen) {
      const value = raw(state)[axis.key];
      point[state.name] = value === null ? 0 : Math.round((value / max[axis.key]) * 100);
      point[`${state.name}__raw`] = value === null ? -1 : value;
    }
    return point;
  });

  const unit: Record<AxisKey, string> = {
    arable: "% of land",
    agriLand: "% of land",
    yield: " kg/ha",
    valueAdded: "% of GDP",
    window: " months",
  };

  function ChartTooltip({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { payload: Record<string, string | number> }[];
    label?: string;
  }) {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload;
    const axis = AXES.find((a) => a.label === label);
    return (
      <TooltipShell title={String(label)}>
        {chosen.map((state, i) => {
          const rawValue = point[`${state.name}__raw`] as number;
          return (
            <TooltipRow
              key={state.name}
              color={SERIES[i]}
              name={state.name}
              value={
                rawValue < 0
                  ? "no data"
                  : `${Math.round(rawValue * 10) / 10}${axis ? unit[axis.key] : ""} · ${point[state.name]}/100`
              }
            />
          );
        })}
      </TooltipShell>
    );
  }

  return (
    <div className="h-[340px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%" margin={{ top: 28, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke={INK.grid} />
          <PolarAngleAxis dataKey="axis" tick={{ fill: INK.secondary, fontSize: 11 }} />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: INK.muted, fontSize: 10 }}
            tickCount={3}
            axisLine={false}
          />
          <Tooltip content={<ChartTooltip />} />
          {/* Two or more overlaid shapes need the legend to carry identity —
              the fills are 10% washes and cannot do it on hue alone. */}
          <Legend {...LEGEND_PROPS} />
          {chosen.map((state, i) => (
            <Radar
              key={state.name}
              name={state.name}
              dataKey={state.name}
              stroke={SERIES[i]}
              strokeWidth={2}
              fill={SERIES[i]}
              fillOpacity={0.1}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
