"use client";

import {
  AlertTriangle,
  Brain,
  CircleHelp,
  Eye,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { cn } from "../lib/utils";
import type { AnalysisResult, Finding, FindingSeverity } from "../types";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";

const SEVERITY: Record<
  FindingSeverity,
  { label: string; variant: "danger" | "success" | "warning" | "muted"; icon: typeof AlertTriangle; border: string }
> = {
  critical: { label: "Critical", variant: "danger", icon: AlertTriangle, border: "border-ng-danger-bd" },
  opportunity: { label: "Opportunity", variant: "success", icon: TrendingUp, border: "border-ng-success-bd" },
  watch: { label: "Watch", variant: "warning", icon: Eye, border: "border-ng-warning-bd" },
  gap: { label: "Data gap", variant: "muted", icon: CircleHelp, border: "border-ng-border" },
};

const CONFIDENCE: Record<Finding["confidence"], "success" | "warning" | "muted"> = {
  high: "success",
  medium: "warning",
  low: "muted",
};

const SOURCE_LABEL: Record<string, string> = {
  minimax: "MiniMax",
  shogo: "Shogo",
  rules: "Rule-derived",
};

/** Full words rather than "20m ago": an abbreviated unit is ambiguous — "m"
 * reads as either minutes or months — and this sits next to figures whose
 * freshness is the reason to trust them. */
function agoInWords(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "at an unknown time";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/**
 * An agent's reading of one domain.
 *
 * The page is the analysis: a summary the operator reads first, then the
 * findings, each carrying what to do about it and the figures it rests on.
 * Numbers appear only as cited evidence — a member state can already see its
 * own trade table, and what it cannot see is what the region's figures mean
 * together, which is the only thing this console is for.
 *
 * When no model is configured the same shape is filled deterministically and
 * labelled `Rule-derived`, so the page never goes blank and never passes off
 * a rule as a reading.
 */
export function AnalysisView({
  analysis,
  onRefresh,
  refreshing,
}: {
  analysis: AnalysisResult | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  if (!analysis) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const interpreted = analysis.source !== "rules";
  const counts = analysis.findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* What produced this reading, and how fresh it is. */}
      <Card
        className={cn(
          "p-4 sm:p-5",
          interpreted
            ? "border-ng-ai-bd/70 bg-gradient-to-br from-ng-ai-bg to-ng-surface"
            : "bg-gradient-to-br from-ng-muted to-ng-surface"
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
              interpreted ? "bg-ng-ai text-white" : "bg-ng-muted-bd text-ng-primary"
            )}
          >
            {interpreted ? <Sparkles size={13} aria-hidden /> : <Brain size={13} aria-hidden />}
          </span>
          <h2 className="text-ng-base font-semibold text-ng-primary">
            {interpreted ? "Agent analysis" : "Rule-derived findings"}
          </h2>
          <Badge variant={interpreted ? "ai" : "muted"} size="sm">
            {SOURCE_LABEL[analysis.source] ?? analysis.source}
          </Badge>
          <span className="text-ng-2xs text-ng-secondary">
            {agoInWords(analysis.generated_at)}
          </span>

          <span className="ml-auto flex items-center gap-2">
            {Object.entries(counts).map(([severity, count]) => (
              <Badge
                key={severity}
                variant={SEVERITY[severity as FindingSeverity]?.variant ?? "muted"}
                size="sm"
              >
                {count} {SEVERITY[severity as FindingSeverity]?.label.toLowerCase() ?? severity}
              </Badge>
            ))}
            {onRefresh ? (
              <button
                onClick={onRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1 rounded-md border border-ng-border px-2 py-1 text-ng-2xs font-semibold text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
              >
                <RefreshCw
                  size={10}
                  className={refreshing ? "animate-spin" : undefined}
                  aria-hidden
                />
                {refreshing ? "Re-reading…" : "Re-read"}
              </button>
            ) : null}
          </span>
        </div>

        {analysis.summary ? (
          <p className="mt-3 max-w-4xl text-ng-base leading-relaxed text-ng-primary">
            {analysis.summary}
          </p>
        ) : null}

        {analysis.note ? (
          <p className="mt-2 text-ng-xs leading-relaxed text-ng-warning-tx">{analysis.note}</p>
        ) : null}
      </Card>

      {analysis.findings.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-ng-secondary">
            The agent returned no findings for this domain yet.
          </p>
        </Card>
      ) : (
        analysis.findings.map((finding, index) => {
          const severity = SEVERITY[finding.severity] ?? SEVERITY.watch;
          const Icon = severity.icon;
          return (
            <Card key={`${finding.title}-${index}`} className={cn("p-4 sm:p-5", severity.border)}>
              <div className="flex flex-wrap items-center gap-2">
                <Icon size={14} className="shrink-0 text-ng-secondary" aria-hidden />
                <h3 className="text-ng-lg font-semibold leading-snug text-ng-primary">
                  {finding.title}
                </h3>
                <Badge variant={severity.variant} size="sm">
                  {severity.label}
                </Badge>
                <Badge variant={CONFIDENCE[finding.confidence]} size="sm" className="ml-auto">
                  {finding.confidence} confidence
                </Badge>
              </div>

              <p className="mt-2.5 max-w-4xl text-ng-base leading-relaxed text-ng-primary">
                {finding.finding}
              </p>

              {finding.recommendation ? (
                <p className="mt-2.5 max-w-4xl border-l-2 border-ng-accent pl-3 text-ng-base leading-relaxed text-ng-secondary">
                  {finding.recommendation}
                </p>
              ) : null}

              {/* The figures the claim rests on. This is the whole reason the
                  page can drop its tables: the numbers are still here, but
                  attached to the conclusion they support. */}
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
                    <Badge key={state} variant="muted" size="sm" className="font-mono">
                      {state}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </Card>
          );
        })
      )}
    </div>
  );
}
