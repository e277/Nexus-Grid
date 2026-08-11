import { ChartLegend } from "./ChartLegend";
import { ChartTooltip } from "./ChartTooltip";

export interface BarSeries {
  key: string;
  label: string;
  /** CSS color value, e.g. "var(--chart-1)" or "var(--color-warning)". */
  colorVar: string;
}

export interface BarCategory {
  key: string;
  label: string;
  values: Record<string, number>;
}

interface BarChartProps {
  categories: BarCategory[];
  series: BarSeries[];
  valueFormat?: (n: number) => string;
}

/** Horizontal grouped bars — the default form for magnitude comparison with long labels. */
export function BarChart({ categories, series, valueFormat = (n) => n.toLocaleString() }: BarChartProps) {
  if (categories.length === 0) {
    return <p className="text-ng-xs text-ng-secondary">No data yet.</p>;
  }

  const max = Math.max(1, ...categories.flatMap((c) => series.map((s) => c.values[s.key] ?? 0)));

  return (
    <div className="space-y-3">
      <ChartLegend items={series.map((s) => ({ key: s.key, label: s.label, colorVar: s.colorVar }))} />
      <div className="space-y-3">
        {categories.map((cat) => (
          <div key={cat.key}>
            <p className="mb-1 text-ng-xs font-medium text-ng-primary">{cat.label}</p>
            <div className="space-y-[2px]">
              {series.map((s) => {
                const value = cat.values[s.key] ?? 0;
                const pct = Math.max(2, (value / max) * 100);
                return (
                  <div key={s.key} className="flex items-center gap-2">
                    <ChartTooltip
                      label={cat.label}
                      value={`${s.label}: ${valueFormat(value)}`}
                      className="flex h-4 flex-1 items-center rounded-sm bg-ng-well"
                    >
                      <div
                        className="h-full rounded-r-[4px] transition-[width] duration-300"
                        style={{ width: `${pct}%`, backgroundColor: s.colorVar }}
                      />
                    </ChartTooltip>
                    <span className="w-16 shrink-0 text-right text-ng-2xs font-semibold tabular-nums text-ng-secondary">
                      {valueFormat(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
