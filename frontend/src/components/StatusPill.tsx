const STYLES: Record<string, string> = {
  // Status is never color alone: every pill carries its text label.
  planned: "bg-slate-100 text-slate-700",
  in_transit: "bg-sky-100 text-sky-800",
  delayed: "bg-amber-100 text-amber-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-500",
  open: "bg-sky-100 text-sky-800",
  matched: "bg-violet-100 text-violet-800",
  fulfilled: "bg-emerald-100 text-emerald-800",
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  severe: "bg-red-100 text-red-800",
};

export function StatusPill({ value }: { value: string }) {
  const style = STYLES[value] ?? "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {value.replace("_", " ")}
    </span>
  );
}
