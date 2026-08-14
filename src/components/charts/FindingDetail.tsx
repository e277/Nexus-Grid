"use client";

import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import type { TaggedFinding } from "./FindingsBoard";
import { FindingMetrics } from "./FindingMetrics";

const DOMAIN_LABEL: Record<string, string> = {
  market: "Farm-to-Market",
  soil: "Soil & Crop",
  planting: "Planting",
  logistics: "Logistics",
  impact: "Outcomes",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  opportunity: "Opportunity",
  watch: "Watch",
  gap: "Data gap",
};

const SEVERITY_VARIANT: Record<string, "danger" | "success" | "warning" | "muted"> = {
  critical: "danger",
  opportunity: "success",
  watch: "warning",
  gap: "muted",
};

/**
 * One finding in full: the agent's figures, its reasoning, and the evidence.
 *
 * Shown for the selected tile only. Twenty-four of these at once was the
 * document this page stopped being.
 */
export function FindingDetail({
  finding,
  className,
}: {
  finding: TaggedFinding;
  /** Set when this is nested — an expanded row supplies its own frame. */
  className?: string;
}) {
  return (
    <Card className={cn("border-ng-accent p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="muted" size="sm">
          {DOMAIN_LABEL[finding.domain] ?? finding.domain}
        </Badge>
        <h3 className="text-ng-lg font-semibold leading-snug text-ng-primary">{finding.title}</h3>
        <Badge variant={SEVERITY_VARIANT[finding.severity]} size="sm">
          {SEVERITY_LABEL[finding.severity]}
        </Badge>
        <Badge
          variant={
            finding.confidence === "high"
              ? "success"
              : finding.confidence === "medium"
                ? "warning"
                : "muted"
          }
          size="sm"
          className="ml-auto"
        >
          {finding.confidence} confidence
        </Badge>
      </div>

      <FindingMetrics metrics={finding.metrics} />

      <p className="mt-3 max-w-4xl text-ng-sm leading-relaxed text-ng-primary">
        {finding.finding}
      </p>
      {finding.recommendation ? (
        <p className="mt-2 max-w-4xl border-l-2 border-ng-accent pl-3 text-ng-sm leading-relaxed text-ng-secondary">
          {finding.recommendation}
        </p>
      ) : null}

      {finding.evidence.length > 0 ? (
        <div className="mt-3 rounded-md border border-ng-border bg-ng-bg px-3 py-2">
          <p className="text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
            Evidence
          </p>
          <ul className="mt-1 space-y-1">
            {finding.evidence.map((item, i) => (
              <li key={i} className="font-mono text-ng-xs leading-snug text-ng-secondary">
                · {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {finding.states.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {finding.states.map((state) => (
            <Badge key={state} variant="muted" size="sm">
              {state}
            </Badge>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

