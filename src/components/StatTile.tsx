interface StatTileProps {
  label: string;
  value: string | number;
  hint?: string;
  delta?: { label: string; kind: "up" | "down" | "warn" | "neutral" };
}

const DELTA_CLASS = {
  up:      "bg-ng-success-bg text-ng-success-tx",
  down:    "bg-ng-danger-bg  text-ng-danger-tx",
  warn:    "bg-ng-warning-bg text-ng-warning-tx",
  neutral: "bg-ng-muted      text-ng-muted-tx",
} as const;

export function StatTile({ label, value, hint, delta }: StatTileProps) {
  return (
    <div className="rounded-[10px] border border-ng-border bg-ng-surface p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[.5px] text-ng-secondary">
        {label}
      </p>
      <p className="mt-1.5 text-ng-hero font-bold leading-none tracking-tight text-ng-primary">
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-[11px] leading-snug text-ng-secondary">{hint}</p>
      ) : null}
      {delta ? (
        <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${DELTA_CLASS[delta.kind]}`}>
          {delta.label}
        </span>
      ) : null}
    </div>
  );
}
