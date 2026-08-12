import { cn } from "../../lib/utils";

const TONE_FILL = {
  accent: "bg-ng-accent",
  success: "bg-ng-success",
  warning: "bg-ng-warning",
  danger: "bg-ng-danger",
  info: "bg-ng-info",
} as const;

/**
 * A meter, not a chart: the fill carries severity and the track is a recessive
 * step of the surface, so the state reads across the whole bar.
 *
 * The value is always rendered as text beside it by the caller — the bar is
 * the glance, never the only way to read the number.
 */
export function Progress({
  value,
  max = 100,
  tone = "accent",
  className,
  label,
}: {
  value: number;
  max?: number;
  tone?: keyof typeof TONE_FILL;
  className?: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-ng-muted", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", TONE_FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
