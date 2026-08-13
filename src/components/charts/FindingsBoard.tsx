"use client";

import { AlertTriangle, CircleHelp, Eye, TrendingUp } from "lucide-react";

import { cn } from "../../lib/utils";
import type { Finding, FindingSeverity } from "../../types";
import { ChartFrame, SEVERITY_COLOR, SimpleTable } from "./chart-kit";
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
    <ChartFrame
      title="Severity against confidence"
      subtitle="Where the agents' conclusions sit — click a cell to filter"
      table={
        <SimpleTable
          columns={["Severity", ...CONFIDENCE_ORDER.map((c) => c[0].toUpperCase() + c.slice(1))]}
          rows={SEVERITY_ORDER.map((severity) => [
            SEVERITY_LABEL[severity],
            ...CONFIDENCE_ORDER.map(
              (confidence) =>
                findings.filter((f) => f.severity === severity && f.confidence === confidence)
                  .length
            ),
          ])}
        />
      }
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
                  {confidence} confidence
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
 * Every finding as a tile, led by its own headline figure.
 *
 * The list this replaces was three paragraphs per finding and twenty-four
 * findings — the page was a document. A tile carries what a reader scans by:
 * severity in the stripe, the domain, the headline, and the agent's own lead
 * metric drawn as a bar. The prose is one click away rather than all of it at
 * once, which is what makes twenty-four of them readable.
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
  if (findings.length === 0) return null;

  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {findings.map((finding, index) => {
        const Icon = SEVERITY_ICON[finding.severity] ?? Eye;
        const lead = finding.metrics[0] ?? null;
        const share =
          lead && lead.of !== null && lead.of > 0
            ? Math.max(0, Math.min(1, lead.value / lead.of))
            : null;
        const active = selectedIndex === index;

        return (
          <li key={`${finding.domain}-${finding.title}-${index}`}>
            <button
              onClick={() => onSelect(active ? null : index)}
              aria-expanded={active}
              className={cn(
                "flex h-full w-full flex-col rounded-[10px] border bg-ng-surface p-3 text-left transition-colors hover:border-ng-muted-bd focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent",
                active ? "border-ng-accent ring-1 ring-ng-accent" : "border-ng-border"
              )}
            >
              <span className="flex items-center gap-1.5">
                <Icon
                  size={12}
                  aria-hidden
                  style={{ color: SEVERITY_COLOR[finding.severity] }}
                  className="shrink-0"
                />
                <span className="truncate text-ng-2xs font-semibold uppercase tracking-[.5px] text-ng-secondary">
                  {finding.domain}
                </span>
                <span
                  className="ml-auto shrink-0 text-ng-2xs font-semibold"
                  style={{ color: SEVERITY_COLOR[finding.severity] }}
                >
                  {SEVERITY_LABEL[finding.severity]}
                </span>
              </span>

              <span className="mt-1.5 line-clamp-2 text-ng-sm font-semibold leading-snug text-ng-primary">
                {finding.title}
              </span>

              {lead ? (
                <span className="mt-auto block pt-2.5">
                  <span className="block text-ng-2xl font-bold leading-none tracking-tight text-ng-primary">
                    {formatMetric(lead.value, lead.unit)}
                  </span>
                  <span className="mt-0.5 block truncate text-ng-2xs text-ng-secondary">
                    {lead.label}
                  </span>
                  {share !== null ? (
                    <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-ng-muted">
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
              ) : null}

              <span className="mt-2 flex items-center gap-1.5 text-ng-2xs text-ng-secondary">
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    finding.confidence === "high"
                      ? "bg-ng-success"
                      : finding.confidence === "medium"
                        ? "bg-ng-warning"
                        : "bg-ng-muted-bd"
                  )}
                />
                {finding.confidence} confidence
                <span className="ml-auto text-ng-accent">
                  {active ? "Hide detail" : "Show detail"}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
