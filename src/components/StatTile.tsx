import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

/**
 * Tints carry meaning, they are not decoration.
 *
 * Every tone maps to a semantic token — never to the categorical chart
 * palette — so a tinted tile reads as a status and can't be mistaken for a
 * data series. The wash is a gradient off the tint into the card surface:
 * enough to group at a glance, never a saturated block behind a number.
 */
const TONE_CARD = {
  neutral: "",
  accent: "border-ng-accent/30 bg-gradient-to-br from-ng-accent-lit to-ng-surface",
  success: "border-ng-success-bd/70 bg-gradient-to-br from-ng-success-bg to-ng-surface",
  info: "border-ng-info-bd/70 bg-gradient-to-br from-ng-info-bg to-ng-surface",
  warning: "border-ng-warning-bd/70 bg-gradient-to-br from-ng-warning-bg to-ng-surface",
  danger: "border-ng-danger-bd/70 bg-gradient-to-br from-ng-danger-bg to-ng-surface",
  ai: "border-ng-ai-bd/70 bg-gradient-to-br from-ng-ai-bg to-ng-surface",
} as const;

const TONE_ICON = {
  neutral: "text-ng-secondary",
  accent: "text-ng-accent",
  success: "text-ng-success-tx",
  info: "text-ng-info-tx",
  warning: "text-ng-warning-tx",
  danger: "text-ng-danger-tx",
  ai: "text-ng-ai-tx",
} as const;

const DELTA_VARIANT = {
  up: "success",
  down: "danger",
  warn: "warning",
  neutral: "muted",
} as const;

export type StatTone = keyof typeof TONE_CARD;

interface StatTileProps {
  label: string;
  value: string | number;
  /** One line under the value — what the number is measured against. */
  hint?: string;
  icon?: ReactNode;
  tone?: StatTone;
  delta?: { label: string; kind: keyof typeof DELTA_VARIANT };
}

export function StatTile({ label, value, hint, icon, tone = "neutral", delta }: StatTileProps) {
  return (
    <Card className={cn("p-4 sm:p-5", TONE_CARD[tone])}>
      <div className="flex items-center gap-1.5">
        {icon ? <span className={cn("shrink-0", TONE_ICON[tone])}>{icon}</span> : null}
        <p className="text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">{label}</p>
      </div>
      {/* Proportional figures: tabular-nums makes a display-size number look
          loose. Columns of numbers get tabular-nums; a hero value does not. */}
      <p className="mt-1.5 text-ng-hero font-bold leading-none tracking-tight text-ng-primary">
        {value}
      </p>
      {hint ? <p className="mt-2 text-ng-xs leading-snug text-ng-secondary">{hint}</p> : null}
      {delta ? (
        <Badge variant={DELTA_VARIANT[delta.kind]} className="mt-2">
          {delta.label}
        </Badge>
      ) : null}
    </Card>
  );
}
