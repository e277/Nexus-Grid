"use client";

import type { ReactNode } from "react";

/**
 * Shared chart chrome, so every chart on the analysis page reads as one system.
 *
 * Everything here plots **agent output** — how many findings the agents
 * raised, at what severity and confidence, how they scored suppliers, what
 * humans answered at the gate. Nothing here plots a publisher's data
 * directly; the figures behind a finding live in that finding's evidence,
 * beside the conclusion they support.
 *
 * The categorical slots are assigned in fixed order and never cycled, so a
 * series keeps its colour when a filter removes its neighbours. Both modes
 * were validated against their own card surface — dark #1E293B, light
 * #FFFFFF — for the lightness band, the chroma floor, adjacent-pair CVD
 * separation (worst ΔE 8.4 dark / 9.1 light under protanopia), the
 * normal-vision floor (19.3 / 19.6) and contrast. Do not hand-pick a sixth.
 */
export const SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

/**
 * Severity is a status, not a series.
 *
 * These are the semantic tokens, deliberately distinct from the categorical
 * slots: "critical" *means* critical, so it must never be mistaken for
 * "series 1", and it always travels with its label rather than relying on
 * hue alone.
 */
export const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--color-danger)",
  opportunity: "var(--color-success)",
  watch: "var(--color-warning)",
  gap: "var(--color-muted-border)",
};

/** Gate outcomes mean good and bad, so they wear status tokens too. */
export const DECISION_COLOR: Record<string, string> = {
  approved: "var(--color-success)",
  modified: "var(--color-info)",
  escalated: "var(--color-warning)",
  rejected: "var(--color-danger)",
};

export const INK = {
  primary: "var(--color-text-primary)",
  secondary: "var(--color-text-secondary)",
  muted: "var(--color-text-disabled)",
  grid: "var(--color-border)",
  surface: "var(--color-surface)",
};

/** Hairline, solid, one step off the surface — never dashed. */
export const GRID_PROPS = { stroke: INK.grid, strokeWidth: 1 } as const;

export const AXIS_PROPS = {
  stroke: INK.grid,
  tick: { fill: INK.secondary, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

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
 * The value wears a text token, never the series colour — the swatch beside
 * it carries identity, and a light categorical hue is illegible as text.
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
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} />
      {name}
      <span className="ml-auto pl-4 font-medium tabular-nums text-ng-primary">{value}</span>
    </p>
  );
}

/**
 * The key, rendered outside the chart.
 *
 * Recharts reorders a stacked legend and its types do not accept an explicit
 * payload, which left the key in a different order from the stack it
 * described. Rendering it here keeps series order under our control, and the
 * swatch beside each label is what carries identity — the text stays in a
 * text token, never the series colour.
 */
export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-ng-xs text-ng-secondary">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** A chart with its title, and a table view so no value is gated behind hover. */
export function ChartFrame({
  title,
  subtitle,
  children,
  table,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** The same numbers as rows. Every chart here has one. */
  table?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-ng-border bg-ng-surface">
      <div className="border-b border-ng-border px-4 py-3">
        <h3 className="text-ng-base font-semibold text-ng-primary">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-ng-xs text-ng-secondary">{subtitle}</p> : null}
      </div>
      <div className="p-4">{children}</div>
      {table ? (
        <details className="border-t border-ng-border">
          <summary className="cursor-pointer px-4 py-2 text-ng-2xs font-semibold uppercase tracking-[.6px] text-ng-secondary hover:text-ng-primary">
            Table view
          </summary>
          <div className="overflow-x-auto px-4 pb-3">{table}</div>
        </details>
      ) : null}
    </section>
  );
}

/** The table twin every chart ships with. */
export function SimpleTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="w-full text-left text-ng-xs">
      <thead>
        <tr className="border-b border-ng-border">
          {columns.map((column, i) => (
            <th
              key={column}
              className={`py-1.5 pr-3 font-semibold uppercase tracking-[.5px] text-ng-secondary ${i > 0 ? "text-right" : ""}`}
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-ng-border last:border-0">
            {row.map((cell, j) => (
              <td
                key={j}
                className={`py-1.5 pr-3 text-ng-primary ${j > 0 ? "text-right tabular-nums" : ""}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${Math.round(value / 1_000_000)}M`;
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}
