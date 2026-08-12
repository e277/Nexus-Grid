"use client";

import { cn } from "../../lib/utils";

export interface PillOption<T extends string> {
  value: T;
  label: string;
  /** Optional dot colour (a CSS colour or var) shown before the label. */
  dot?: string;
  count?: number;
}

/**
 * A single-select pill row.
 *
 * Rendered as a real radio group rather than buttons so a keyboard reader gets
 * arrow-key movement and one tab stop for the whole filter, which is what a
 * filter row should be.
 */
export function PillTabs<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: PillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-ng-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent",
              selected
                ? "border-ng-accent bg-ng-accent-lit text-ng-accent"
                : "border-ng-border bg-ng-surface text-ng-secondary hover:border-ng-muted-bd hover:text-ng-primary"
            )}
          >
            {option.dot ? (
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: option.dot }}
              />
            ) : null}
            {option.label}
            {option.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 font-mono text-ng-2xs",
                  selected ? "bg-ng-accent/20" : "bg-ng-muted text-ng-muted-tx"
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
