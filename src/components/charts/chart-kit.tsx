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

/**
 * Confidence is ordinal, not a status.
 *
 * One hue stepped light to dark, because low → medium → high has a natural
 * order and no polarity. It deliberately does not wear the status tokens: a
 * low-confidence finding is not a bad one, it is one the agent wants checked
 * before it is acted on, and colouring it red-amber-green says the opposite.
 *
 * Defined once and imported wherever confidence appears, so the chart and the
 * table cannot drift apart — they encoded the same variable two different ways
 * until this existed.
 */
export const CONFIDENCE_COLOR: Record<string, string> = {
  low: "color-mix(in oklab, var(--color-accent) 40%, var(--color-surface))",
  medium: "color-mix(in oklab, var(--color-accent) 64%, var(--color-surface))",
  high: "color-mix(in oklab, var(--color-accent) 88%, var(--color-surface))",
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

/**
 * A chart with its title, at the full width of its column.
 *
 * Every chart used to ship a table twin beside it, taking a fixed 22rem of a
 * two-column grid — so the chart, the thing a reader came for, was rendered in
 * whatever was left. The twin existed to keep values off the hover layer,
 * which is a real requirement and is now met the direct way: every mark
 * carries its own number, so there is nothing to open a table to find.
 *
 * The counts these charts plot are small and few — five domains, three
 * confidence levels, four gate outcomes — which is exactly the case where
 * labelling every mark is legible rather than noise.
 */
export function ChartFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-ng-border bg-ng-surface">
      <div className="border-b border-ng-border px-4 py-3">
        <h3 className="text-ng-base font-semibold text-ng-primary">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-ng-xs text-ng-secondary">{subtitle}</p> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * The label a mark wears, in ink rather than in the series colour.
 *
 * Recharts defaults a label to its bar's fill, which puts a categorical hue on
 * text — light enough to fail contrast on the card, and a second encoding of
 * an identity the mark already carries.
 */
export const VALUE_LABEL = {
  fill: INK.secondary,
  fontSize: 11,
  fontWeight: 600,
} as const;

export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${Math.round(value / 1_000_000)}M`;
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}
