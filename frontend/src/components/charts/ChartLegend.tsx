export interface LegendItem {
  key: string;
  label: string;
  colorVar: string;
}

/** A line key (never a filled swatch box), per the dataviz skill's mark spec. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.key} className="flex items-center gap-1.5 text-ng-xs text-ng-secondary">
          <span className="h-[3px] w-3 shrink-0 rounded-full" style={{ backgroundColor: item.colorVar }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
