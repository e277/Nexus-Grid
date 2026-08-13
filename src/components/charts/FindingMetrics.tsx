"use client";

import type { FindingMetric, MetricUnit } from "../../types";

/**
 * A finding's figures, drawn rather than written.
 *
 * These are the numbers the agent itself attached to its conclusion — not
 * scraped back out of its prose, which is what the console used to do and what
 * made the page a wall of text with the quantities buried inside it. The agent
 * returns `{label, value, unit, of}` and this draws it.
 *
 * A metric with an `of` gets a bar, because the part-to-whole is the point:
 * "$190M bought outside CARICOM, of $190M total" says the whole commodity is
 * imported, and the full bar says it faster than the sentence does. A metric
 * without one is just the figure, large enough to read at a glance.
 */
export function FindingMetrics({ metrics }: { metrics: FindingMetric[] }) {
  if (metrics.length === 0) return null;

  return (
    <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {metrics.map((metric, index) => {
        const share =
          metric.of !== null && metric.of > 0
            ? Math.max(0, Math.min(1, metric.value / metric.of))
            : null;

        return (
          <li
            key={`${metric.label}-${index}`}
            className="rounded-md border border-ng-border bg-ng-bg px-3 py-2"
          >
            <p className="truncate text-ng-2xs font-semibold uppercase tracking-[.5px] text-ng-secondary">
              {metric.label}
            </p>
            <p className="mt-0.5 text-ng-2xl font-bold leading-none tracking-tight text-ng-primary">
              {formatMetric(metric.value, metric.unit)}
            </p>

            {share !== null ? (
              <>
                {/* The track is a lighter step of the same hue, so the unfilled
                    part reads as the remainder rather than as empty space. */}
                <div
                  role="img"
                  aria-label={`${formatMetric(metric.value, metric.unit)} of ${formatMetric(metric.of!, metric.unit)}`}
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ng-muted"
                >
                  <div
                    className="h-full rounded-full bg-ng-accent"
                    style={{ width: `${share * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-ng-2xs tabular-nums text-ng-secondary">
                  {Math.round(share * 100)}% of {formatMetric(metric.of!, metric.unit)}
                </p>
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Compact but never lossy about the unit — a bare number invites a wrong one. */
export function formatMetric(value: number, unit: MetricUnit): string {
  switch (unit) {
    case "usd": {
      const abs = Math.abs(value);
      if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
      if (abs >= 1_000_000) return `$${Math.round(value / 1_000_000)}M`;
      if (abs >= 1_000) return `$${Math.round(value / 1_000)}k`;
      return `$${Math.round(value)}`;
    }
    case "percent":
      return `${Math.round(value * 10) / 10}%`;
    case "months":
      return `${Math.round(value)} mo`.replace(" mo", value === 1 ? " month" : " months");
    case "hours":
      return `${Math.round(value * 10) / 10}h`;
    case "km":
      return `${Math.round(value).toLocaleString()} km`;
    case "count":
    default:
      return `${Math.round(value * 10) / 10}`;
  }
}
