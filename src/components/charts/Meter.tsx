interface MeterProps {
  value: number;
  max: number;
  label?: string;
}

/** A single ratio-against-a-limit figure — unfilled track is a lighter step of the same ramp, never neutral gray. */
export function Meter({ value, max, label }: MeterProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div>
      {label ? (
        <div className="mb-1.5 flex items-center justify-between text-ng-xs">
          <span className="font-medium text-ng-secondary">{label}</span>
          <span className="font-semibold tabular-nums text-ng-primary">{Math.round(pct)}%</span>
        </div>
      ) : null}
      <div className="h-2 rounded-full bg-ng-accent-lit">
        <div
          className="h-2 rounded-full bg-ng-accent transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
