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
 * How bad severities rank against each other, worst first.
 *
 * Not a new judgement — it's the ordering already implicit in
 * `SEVERITY_COLOR` above (danger > warning > muted > success), made explicit
 * so a worst-of-many rollup has one true ranking to reduce to instead of
 * every caller inventing its own.
 */
const SEVERITY_RANK: Record<string, number> = {
  critical: 3,
  watch: 2,
  gap: 1,
  opportunity: 0,
};

/** The single worst severity among a set of findings, or `null` if there are none. */
export function worstSeverity(findings: { severity: string }[]): string | null {
  if (findings.length === 0) return null;
  return findings.reduce(
    (worst, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[worst] ? f.severity : worst),
    findings[0].severity
  );
}

/**
 * Confidence is ordinal, not a status.
 *
 * One hue stepped light to dark, because low → medium → high has a natural
 * order and no polarity. It deliberately does not wear the status tokens: a
 * low-confidence finding is not a bad one, it is one the agent wants checked
 * before it is acted on, and colouring it red-amber-green says the opposite.
 *
 * Defined once and imported wherever confidence appears, so the chart, the
 * table and the matrix cannot encode the same variable two different ways.
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
 * The chart takes the full width of its column. Keeping values off the hover
 * layer is a real requirement, and it is met directly: every mark carries its
 * own number, so there is nothing to open a table to find.
 *
 * The counts these charts plot are small and few — five domains, three
 * confidence levels, four gate outcomes — which is exactly the case where
 * labelling every mark is legible rather than noise.
 */
/**
 * The two chrome weights a card on an analysis page can carry.
 *
 * "Primary" is the unchanged original: a raised surface, a divided header,
 * full-weight title ink. It's what every card used before this pair existed,
 * so it stays the default — every existing call site with no `variant` is a
 * zero-diff no-op.
 *
 * "Supporting" is a real demotion, not a colour tweak: the surface drops
 * flush with the page instead of sitting raised on it, the header loses its
 * dividing rule, and the title steps down a weight. Exported so `KpiStrip`
 * (which needs the identical treatment but isn't a `ChartFrame` consumer)
 * shares this definition instead of carrying a second copy that can drift.
 */
export const CARD_CHROME = {
  primary: "overflow-hidden rounded-[10px] border border-ng-border bg-ng-surface",
  supporting: "overflow-hidden rounded-[10px] border border-ng-border/60 bg-ng-bg",
} as const;

export const CARD_HEADER_CHROME = {
  primary: "border-b border-ng-border px-4 py-3",
  supporting: "px-4 py-3",
} as const;

export const CARD_TITLE_CHROME = {
  primary: "text-ng-base font-semibold text-ng-primary",
  supporting: "text-ng-sm font-medium text-ng-secondary",
} as const;

export function ChartFrame({
  title,
  subtitle,
  children,
  variant = "primary",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** "supporting" for context/derived charts — everything that isn't the
   *  page's primary data (the findings matrix, the findings table itself). */
  variant?: "primary" | "supporting";
}) {
  return (
    <section className={CARD_CHROME[variant]}>
      <div className={CARD_HEADER_CHROME[variant]}>
        <h3 className={CARD_TITLE_CHROME[variant]}>{title}</h3>
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
