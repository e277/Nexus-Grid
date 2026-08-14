"use client";

import { Fragment } from "react";

import { AlertTriangle, ChevronDown, CircleHelp, Eye, TrendingUp } from "lucide-react";

import { cn } from "../../lib/utils";
import { Pagination, usePagination } from "../ui/pagination";
import type { Finding, FindingSeverity } from "../../types";
import { ChartFrame, CONFIDENCE_COLOR, SEVERITY_COLOR } from "./chart-kit";
import { FindingDetail } from "./FindingDetail";
import { formatMetric } from "./FindingMetrics";

const SEVERITY_ORDER: FindingSeverity[] = ["critical", "opportunity", "watch", "gap"];
const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  critical: "Critical",
  opportunity: "Opportunity",
  watch: "Watch",
  gap: "Data gap",
};
const SEVERITY_ICON = {
  critical: AlertTriangle,
  opportunity: TrendingUp,
  watch: Eye,
  gap: CircleHelp,
} as const;

const CONFIDENCE_ORDER = ["high", "medium", "low"] as const;

export interface TaggedFinding extends Finding {
  domain: string;
}

/**
 * Where the findings sit, by how serious and how sure.
 *
 * A matrix rather than two separate bars because the pairing is the question
 * an operator actually has: a critical finding held at low confidence needs
 * checking before it needs acting on, and that cell is invisible if severity
 * and confidence are only ever charted apart.
 *
 * Cells carry their count as text, so the shading is a second reading of a
 * number that is already there rather than the only way to see it.
 */
export function FindingsMatrix({
  findings,
  onSelect,
  selected,
}: {
  findings: TaggedFinding[];
  onSelect?: (cell: { severity: FindingSeverity; confidence: string } | null) => void;
  selected?: { severity: FindingSeverity; confidence: string } | null;
}) {
  const max = Math.max(
    1,
    ...SEVERITY_ORDER.flatMap((severity) =>
      CONFIDENCE_ORDER.map(
        (confidence) =>
          findings.filter((f) => f.severity === severity && f.confidence === confidence).length
      )
    )
  );

  return (
    // No table twin: this *is* the table. Every cell prints its count as
    // text, and the shading is a second reading of a number already there.
    <ChartFrame
      title="Severity against confidence"
      subtitle="Where the agents' conclusions sit — click a cell to filter"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-32 px-1 py-1 text-left text-ng-2xs font-bold uppercase tracking-[.5px] text-ng-secondary">
                &nbsp;
              </th>
              {CONFIDENCE_ORDER.map((confidence) => (
                <th
                  key={confidence}
                  scope="col"
                  className="px-1 py-1 text-center text-ng-2xs font-bold uppercase tracking-[.5px] text-ng-secondary"
                >
                  <span className="inline-flex items-center gap-1">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-ng-border"
                      style={{ background: CONFIDENCE_COLOR[confidence] }}
                    />
                    {confidence} confidence
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SEVERITY_ORDER.map((severity) => (
              <tr key={severity}>
                <th
                  scope="row"
                  className="whitespace-nowrap px-1 py-1 text-left text-ng-xs font-medium text-ng-primary"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-[2px]"
                      style={{ background: SEVERITY_COLOR[severity] }}
                    />
                    {SEVERITY_LABEL[severity]}
                  </span>
                </th>
                {CONFIDENCE_ORDER.map((confidence) => {
                  const count = findings.filter(
                    (f) => f.severity === severity && f.confidence === confidence
                  ).length;
                  const active =
                    selected?.severity === severity && selected?.confidence === confidence;
                  return (
                    <td key={confidence} className="p-0">
                      <button
                        disabled={count === 0}
                        onClick={() =>
                          onSelect?.(active ? null : { severity, confidence })
                        }
                        aria-label={`${count} ${SEVERITY_LABEL[severity]} findings at ${confidence} confidence`}
                        className={cn(
                          "h-11 w-full rounded text-ng-base font-bold tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent",
                          count === 0
                            ? "cursor-default border border-dashed border-ng-border text-ng-disabled"
                            : "text-ng-primary",
                          active && "ring-2 ring-ng-accent"
                        )}
                        style={
                          count === 0
                            ? undefined
                            : {
                                background: `color-mix(in oklab, ${SEVERITY_COLOR[severity]} ${Math.round(
                                  18 + (count / max) * 62
                                )}%, var(--color-surface))`,
                              }
                        }
                      >
                        {count === 0 ? "·" : count}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartFrame>
  );
}

/**
 * Every finding as a table row, opening in place.
 *
 * A tile grid still spent a card on each finding; twenty-four of them was a
 * gallery to scroll rather than a set to compare. Rows put severity,
 * confidence and the agent's own headline figure in fixed columns, so the
 * findings can be read against each other — which is the whole reason they are
 * on a page together.
 *
 * The reasoning opens as a row directly beneath the one clicked, not as a
 * panel under the table. With twenty-four rows the panel could be a screen
 * away from the row that opened it, which left the reader scrolling to find
 * out what they had just asked for and then scrolling back to pick the next
 * one.
 */
export function FindingsBoard({
  findings,
  selectedIndex,
  onSelect,
}: {
  findings: TaggedFinding[];
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
}) {
  // Paged on the same list `selectedIndex` indexes into, and the offset is
  // added back below — so the row that is open stays open when the reader
  // pages away and returns, instead of a different row springing open in its
  // place.
  const paged = usePagination(findings, 25, findings.length);

  if (findings.length === 0) return null;

  return (
    <div className="rounded-[10px] border border-ng-border bg-ng-surface">
      <div className="max-h-[65vh] overflow-auto">
      <table className="w-full min-w-[720px] text-left">
        <thead>
          <tr>
            {["Severity", "Domain", "Finding", "Key figure", "Confidence"].map((column, i) => (
              <th
                key={column}
                className={cn(
                  "px-3 py-2 text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary",
                  "sticky top-0 z-10 bg-ng-surface border-b border-ng-border",
                  i === 3 && "text-right"
                )}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paged.pageItems.map((finding, offsetIndex) => {
            const index = paged.page * (paged.pageSize === 0 ? findings.length : paged.pageSize) + offsetIndex;
            const Icon = SEVERITY_ICON[finding.severity] ?? Eye;
            const lead = finding.metrics[0] ?? null;
            const share =
              lead && lead.of !== null && lead.of > 0
                ? Math.max(0, Math.min(1, lead.value / lead.of))
                : null;
            const active = selectedIndex === index;

            return (
              <Fragment key={`${finding.domain}-${finding.title}-${index}`}>
              <tr
                onClick={() => onSelect(active ? null : index)}
                aria-expanded={active}
                className={cn(
                  "cursor-pointer border-b border-ng-border transition-colors last:border-0 hover:bg-ng-accent-lit",
                  active && "bg-ng-accent-lit",
                  index % 2 === 1 && !active && "bg-ng-row-alt"
                )}
              >
                <td className="whitespace-nowrap px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <Icon
                      size={12}
                      aria-hidden
                      style={{ color: SEVERITY_COLOR[finding.severity] }}
                      className="shrink-0"
                    />
                    <span
                      className="text-ng-xs font-semibold"
                      style={{ color: SEVERITY_COLOR[finding.severity] }}
                    >
                      {SEVERITY_LABEL[finding.severity]}
                    </span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-ng-xs text-ng-secondary">
                  {finding.domain}
                </td>
                <td className="px-3 py-2 text-ng-sm font-medium leading-snug text-ng-primary">
                  {finding.title}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {lead ? (
                    <span className="inline-block min-w-[92px] align-middle">
                      <span className="block text-ng-sm font-semibold tabular-nums text-ng-primary">
                        {formatMetric(lead.value, lead.unit)}
                      </span>
                      {share !== null ? (
                        <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-ng-muted">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${share * 100}%`,
                              background: SEVERITY_COLOR[finding.severity],
                            }}
                          />
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-ng-xs text-ng-disabled">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className="flex items-center gap-1.5 text-ng-xs text-ng-secondary">
                    {/* The same ramp the confidence chart uses. This wore
                        green/amber/grey, which read as good/warning/bad for a
                        variable that has an order but no polarity. */}
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-ng-border"
                      style={{ background: CONFIDENCE_COLOR[finding.confidence] }}
                    />
                    {finding.confidence}
                    {/* The affordance the row was missing: nothing said a row
                        could be opened, so the reasoning went unread. */}
                    <ChevronDown
                      size={13}
                      aria-hidden
                      className={cn(
                        "ml-1 shrink-0 transition-transform",
                        active ? "rotate-180 text-ng-accent" : "text-ng-disabled"
                      )}
                    />
                  </span>
                </td>
              </tr>

              {active ? (
                <tr>
                  {/* Spans the table so the detail is not squeezed into one
                      column's width. */}
                  <td colSpan={5} className="bg-ng-bg p-0">
                    <div className="px-3 py-3">
                      <FindingDetail finding={finding} />
                    </div>
                  </td>
                </tr>
              ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
      <Pagination
        {...paged}
        onPage={paged.setPage}
        onPageSize={paged.setPageSize}
        noun="findings"
      />
    </div>
  );
}
