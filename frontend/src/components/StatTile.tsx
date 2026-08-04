interface StatTileProps {
  label: string;
  value: string | number;
  hint?: string;
}

/** A headline number with its label — the "not a chart" form. */
export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}
