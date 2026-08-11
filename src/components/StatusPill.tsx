const STYLES: Record<string, string> = {
  planned:    "bg-ng-muted     text-ng-muted-tx",
  in_transit: "bg-ng-info-bg   text-ng-info-tx",
  delayed:    "bg-ng-warning-bg text-ng-warning-tx",
  delivered:  "bg-ng-success-bg text-ng-success-tx",
  cancelled:  "bg-ng-muted     text-ng-disabled",
  open:       "bg-ng-info-bg   text-ng-info-tx",
  congested:  "bg-ng-warning-bg text-ng-warning-tx",
  closed:     "bg-ng-danger-bg  text-ng-danger-tx",
  matched:    "bg-purple-50    text-purple-700",
  fulfilled:  "bg-ng-success-bg text-ng-success-tx",
  low:        "bg-ng-muted     text-ng-muted-tx",
  medium:     "bg-ng-warning-bg text-ng-warning-tx",
  high:       "bg-orange-50    text-orange-800",
  severe:     "bg-ng-danger-bg  text-ng-danger-tx",
};

export function StatusPill({ value }: { value: string }) {
  const cls = STYLES[value] ?? "bg-ng-muted text-ng-muted-tx";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {value.replace("_", " ")}
    </span>
  );
}
