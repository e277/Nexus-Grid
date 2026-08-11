import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

interface StatTileProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  /**
   * Tints the tile to carry meaning at a glance.
   *
   * Drawn from the semantic tokens, never the chart palette — a tinted tile is
   * a status, and must not read as a data series.
   */
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  delta?: { label: string; kind: "up" | "down" | "warn" | "neutral" };
}

const TONE_CARD = {
  neutral: "",
  accent: "border-ng-accent/30 bg-ng-accent-lit",
  success: "border-ng-success-bd bg-ng-success-bg",
  warning: "border-ng-warning-bd bg-ng-warning-bg",
  danger: "border-ng-danger-bd bg-ng-danger-bg",
} as const;

const TONE_ICON = {
  neutral: "text-ng-secondary",
  accent: "text-ng-accent",
  success: "text-ng-success-tx",
  warning: "text-ng-warning-tx",
  danger: "text-ng-danger-tx",
} as const;

const DELTA_VARIANT = {
  up: "success",
  down: "danger",
  warn: "warning",
  neutral: "muted",
} as const;

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  delta,
}: StatTileProps) {
  return (
    <Card className={cn("p-5", TONE_CARD[tone])}>
      <div className="flex items-center gap-1.5">
        {icon ? <span className={cn("shrink-0", TONE_ICON[tone])}>{icon}</span> : null}
        <p className="text-[11px] font-semibold uppercase tracking-[.5px] text-ng-secondary">
          {label}
        </p>
      </div>
      <p className="mt-1.5 text-ng-hero font-bold leading-none tracking-tight text-ng-primary">
        {value}
      </p>
      {hint ? <p className="mt-2 text-[11px] leading-snug text-ng-secondary">{hint}</p> : null}
      {delta ? (
        <Badge variant={DELTA_VARIANT[delta.kind]} className="mt-2">
          {delta.label}
        </Badge>
      ) : null}
    </Card>
  );
}
