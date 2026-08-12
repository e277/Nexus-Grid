"use client";

import type { ReactNode } from "react";

/**
 * Shared chart chrome, so every chart in the console reads as one system.
 *
 * The categorical slots are assigned in fixed order and never cycled: a series
 * keeps its colour when a filter removes its neighbours. Both modes were
 * validated against their own card surface — dark #1E293B, light #FFFFFF —
 * for the lightness band, the chroma floor, adjacent-pair CVD separation
 * (worst ΔE 8.4 dark / 9.1 light, protan), the normal-vision floor (19.3 /
 * 19.6) and contrast. Do not hand-pick a sixth.
 */
export const SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export const INK = {
  primary: "var(--color-text-primary)",
  secondary: "var(--color-text-secondary)",
  muted: "var(--color-text-disabled)",
  grid: "var(--color-border)",
  surface: "var(--color-surface)",
};

/** Hairline, solid, one step off the surface — never dashed. */
export const GRID_PROPS = {
  stroke: INK.grid,
  strokeWidth: 1,
} as const;

export const AXIS_PROPS = {
  stroke: INK.grid,
  tick: { fill: INK.secondary, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export function usd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${Math.round(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value * 10) / 10);
}

/** A tooltip shell in the card's own idiom — used by every chart here. */
export function TooltipShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pointer-events-none rounded-md border border-ng-border bg-ng-surface px-3 py-2 shadow-ng-md">
      <p className="text-ng-sm font-semibold text-ng-primary">{title}</p>
      <div className="mt-1 space-y-0.5">{children}</div>
    </div>
  );
}

/**
 * One row of a tooltip: swatch, name, value.
 *
 * The value wears a text token, never the series colour — the swatch beside it
 * is what carries identity, and a light categorical hue is illegible as text.
 */
export function TooltipRow({
  color,
  name,
  value,
}: {
  color: string;
  name: string;
  value: string;
}) {
  return (
    <p className="flex items-center gap-1.5 text-ng-xs text-ng-secondary">
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-[2px]"
        style={{ background: color }}
      />
      {name}
      <span className="ml-auto pl-4 font-medium tabular-nums text-ng-primary">{value}</span>
    </p>
  );
}

/** Legend text in a text token, with the mark beside it carrying the colour. */
export function legendFormatter(value: string) {
  return <span className="text-ng-xs text-ng-secondary">{value}</span>;
}

export const LEGEND_PROPS = {
  verticalAlign: "top",
  align: "left",
  height: 28,
  iconType: "square",
  iconSize: 9,
  formatter: legendFormatter,
} as const;
