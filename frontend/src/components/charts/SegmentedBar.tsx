import { ChartLegend } from "./ChartLegend";
import { ChartTooltip } from "./ChartTooltip";

export interface Segment {
  key: string;
  label: string;
  value: number;
  /** CSS color value, e.g. "var(--chart-1)" or "var(--color-warning)". */
  colorVar: string;
}

interface SegmentedBarProps {
  segments: Segment[];
  valueFormat?: (n: number) => string;
  showLegend?: boolean;
}

/**
 * A single proportional bar — the part-to-whole form (never a donut/pie,
 * per the dataviz skill's anti-pattern guidance). The legend is the relief
 * mechanism for any low-contrast slot (e.g. chart-3/aqua), always shown for
 * 2+ segments.
 */
export function SegmentedBar({ segments, valueFormat = (n) => n.toLocaleString(), showLegend }: SegmentedBarProps) {
  const visible = segments.filter((s) => s.value > 0);
  const total = visible.reduce((sum, s) => sum + s.value, 0);
  const legend = showLegend ?? visible.length >= 2;

  if (total === 0) {
    return <p className="text-ng-xs text-ng-secondary">No data yet.</p>;
  }

  return (
    <div className="space-y-2.5">
      <div className="flex h-5 w-full gap-[2px] overflow-hidden rounded-sm bg-ng-well">
        {visible.map((s) => (
          <ChartTooltip
            key={s.key}
            label={s.label}
            value={valueFormat(s.value)}
            className="h-full min-w-[3px] first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.colorVar }}
          />
        ))}
      </div>
      {legend ? (
        <ChartLegend
          items={visible.map((s) => ({
            key: s.key,
            label: `${s.label} (${valueFormat(s.value)})`,
            colorVar: s.colorVar,
          }))}
        />
      ) : null}
    </div>
  );
}
