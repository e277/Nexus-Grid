"use client";

import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

export interface MatrixCell {
  /** Rendered in the cell — the value is never carried by colour alone. */
  label: string;
  /** 0..1, mapped onto the ramp. `null` renders an explicit "no coverage". */
  intensity: number | null;
  title: string;
}

/**
 * A labelled heat matrix.
 *
 * Every cell prints its own value, so the colour is a second reading of a
 * number that is already there — which is what keeps the grid legible under
 * colour-vision deficiency, in grayscale print, and at a glance.
 *
 * The ramp is **sequential**: one hue, light→dark with magnitude. Ink flips to
 * the surface colour on the darkest steps so the label always clears contrast.
 */
export function Matrix({
  columns,
  rows,
  rowLabel,
  cell,
  legend,
}: {
  columns: string[];
  rows: string[];
  rowLabel?: (row: string) => ReactNode;
  cell: (row: string, column: string) => MatrixCell;
  legend?: ReactNode;
}) {
  if (rows.length === 0 || columns.length === 0) {
    return (
      <p className="py-6 text-center text-ng-sm text-ng-secondary">
        Not enough coverage to build the matrix.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-[2px]">
          {/* The row-label column shrinks to its content; the data columns
              split what is left evenly. Without this the label column absorbs
              all the slack and the cells huddle against the right edge. */}
          <colgroup>
            <col style={{ width: "1%" }} />
            {columns.map((column) => (
              <col key={column} style={{ width: `${99 / columns.length}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-ng-surface px-2 py-1 text-left text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
                &nbsp;
              </th>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-1 py-1 text-center text-ng-2xs font-bold uppercase tracking-[.5px] text-ng-secondary"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap bg-ng-surface px-2 py-1 text-left text-ng-xs font-medium text-ng-primary"
                >
                  {rowLabel ? rowLabel(row) : row}
                </th>
                {columns.map((column) => {
                  const data = cell(row, column);
                  const missing = data.intensity === null;
                  const t = data.intensity ?? 0;
                  // One hue, light→dark. The darkest two-fifths take surface
                  // ink so the label never sits dark-on-dark.
                  return (
                    <td
                      key={column}
                      title={data.title}
                      className={cn(
                        "h-8 rounded px-1 text-center text-ng-2xs font-semibold tabular-nums",
                        missing && "border border-dashed border-ng-border text-ng-disabled"
                      )}
                      style={
                        missing
                          ? undefined
                          : {
                              background: `color-mix(in oklab, var(--color-accent) ${Math.round(14 + t * 76)}%, var(--color-surface))`,
                              color:
                                t > 0.58
                                  ? "var(--color-accent-fg)"
                                  : "var(--color-text-primary)",
                            }
                      }
                    >
                      {data.label}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {legend ? <div className="flex flex-wrap items-center gap-3">{legend}</div> : null}
    </div>
  );
}

/** A sequential scale key: five steps of the same hue, low → high. */
export function MatrixLegend({ low, high }: { low: string; high: string }) {
  return (
    <>
      <span className="text-ng-2xs text-ng-secondary">{low}</span>
      <span className="flex" aria-hidden>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <span
            key={t}
            className="h-3 w-6 first:rounded-l last:rounded-r"
            style={{
              background: `color-mix(in oklab, var(--color-accent) ${Math.round(14 + t * 76)}%, var(--color-surface))`,
            }}
          />
        ))}
      </span>
      <span className="text-ng-2xs text-ng-secondary">{high}</span>
      <span className="flex items-center gap-1.5 text-ng-2xs text-ng-secondary">
        <span
          aria-hidden
          className="h-3 w-6 rounded border border-dashed border-ng-border"
        />
        No coverage
      </span>
    </>
  );
}
