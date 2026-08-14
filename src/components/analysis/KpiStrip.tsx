"use client";

import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

/**
 * The headline row, in the idiom a BI dashboard uses for one.
 *
 * Quiet by design — one rule between cells, a label, a figure, and one line of
 * context — so the eye lands on the numbers and then moves down to the charts
 * that explain them. Tinted panels here would compete with those charts.
 *
 * The figures use proportional digits, not `tabular-nums`: equal-width digits
 * make a display-size number look loose. Tabular figures belong where numbers
 * stack vertically, which is the tables, not here.
 */
export function KpiStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 divide-y divide-ng-border overflow-hidden rounded-[10px] border border-ng-border bg-ng-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {children}
    </div>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint: string;
  /** Only for figures that genuinely mean good or bad. */
  tone?: "neutral" | "danger" | "success" | "warning";
}) {
  const ink = {
    neutral: "text-ng-primary",
    danger: "text-ng-danger",
    success: "text-ng-success",
    warning: "text-ng-warning",
  }[tone];

  return (
    <div className="min-w-0 px-4 py-3">
      <p className="truncate text-ng-2xs font-bold uppercase tracking-[.7px] text-ng-secondary">
        {label}
      </p>
      <p className={cn("mt-1 text-[26px] font-bold leading-none tracking-tight", ink)}>{value}</p>
      <p className="mt-1.5 truncate text-ng-2xs leading-snug text-ng-secondary" title={hint}>
        {hint}
      </p>
    </div>
  );
}
