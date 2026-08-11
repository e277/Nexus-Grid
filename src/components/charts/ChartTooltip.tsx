import type { CSSProperties, ReactNode } from "react";

interface ChartTooltipProps {
  label: string;
  value: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * Wraps one chart mark (a bar, a segment) with a hover/keyboard-focus
 * tooltip. `tabIndex` + `group-focus` give focus the same reveal as hover,
 * with identical content either way.
 */
export function ChartTooltip({ label, value, className = "", style, children }: ChartTooltipProps) {
  return (
    <div tabIndex={0} style={style} className={`group/tip relative outline-none ${className}`}>
      {children}
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-ng-primary px-2 py-1 text-ng-2xs font-medium text-white opacity-0 shadow-ng-md transition-opacity duration-100 group-hover/tip:opacity-100 group-focus/tip:opacity-100"
      >
        <span className="font-semibold">{label}</span> · {value}
      </div>
    </div>
  );
}
