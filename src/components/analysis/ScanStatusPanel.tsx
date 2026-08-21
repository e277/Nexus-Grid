"use client";

import { useEffect, useState } from "react";
import { Activity, Radio } from "lucide-react";

import { cn } from "../../lib/utils";
import { findPage, pageForDomain, type PageId } from "../../navigation";
import { SEVERITY_COLOR, worstSeverity } from "../charts/chart-kit";
import { Skeleton } from "../ui/skeleton";
import type { AgentActivity, AnalysisResult, Health } from "../../types";

const SEVERITY_TONE: Record<string, string> = {
  critical: "text-ng-danger-tx",
  watch: "text-ng-warning-tx",
  gap: "text-ng-muted-tx",
  opportunity: "text-ng-success-tx",
};

function secondsSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : null;
}

function agoInWords(seconds: number): string {
  if (seconds < 2) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
}

/**
 * The autonomous loop's heartbeat, standing on the Dashboard whether or not
 * a sweep is running.
 *
 * The pipeline diagram below this only ever shows a run someone triggered by
 * hand — the supply agent's own 10-second scan (`runner.ts`) happens on the
 * server regardless, and until this panel existed the Dashboard had no way to
 * say so. An idle diagram and a genuinely idle system looked identical
 * without it, and they are not the same thing: this says which one is true.
 */
export function ScanStatusPanel({
  health,
  lastScan,
  analyses,
  onNavigate,
}: {
  health: Health | null;
  lastScan: AgentActivity | null | undefined;
  analyses: AnalysisResult[] | undefined;
  onNavigate: (page: PageId) => void;
}) {
  // Ticks the "Ns ago" / "next in ~Ns" readout once a second — a different
  // clock from the poll interval below (this one belongs to the agent, not
  // to the page), so it is not borrowed from LiveIndicator.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const scanSeconds = secondsSince(lastScan?.created_at);
  const rawOutputs = lastScan?.context?.outputs as
    | { gaps?: unknown; scanned?: number }
    | undefined;
  const gapCount = Array.isArray(rawOutputs?.gaps) ? rawOutputs.gaps.length : null;
  const scannedCount = typeof rawOutputs?.scanned === "number" ? rawOutputs.scanned : null;

  const intervalSeconds = health?.agent_poll_interval_seconds ?? null;
  const nextInSeconds =
    intervalSeconds !== null && scanSeconds !== null
      ? intervalSeconds - (scanSeconds % intervalSeconds)
      : null;

  const domains = (analyses ?? []).filter((a) => pageForDomain(a.domain) !== null);
  const allFindings = domains.flatMap((a) => a.findings);
  const worst = worstSeverity(allFindings);
  const needsReview =
    worst === "critical" || worst === "watch"
      ? domains.filter((a) => a.findings.some((f) => f.severity === worst)).length
      : 0;

  const headline =
    domains.length === 0
      ? null
      : worst === null
        ? "All domains clear"
        : worst === "opportunity"
          ? "Opportunities only, nothing urgent"
          : worst === "gap"
            ? "Data gaps only"
            : `${needsReview} domain${needsReview === 1 ? "" : "s"} need review`;

  return (
    <div className="grid grid-cols-1 divide-y divide-ng-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
      {/* Left: the loop's heartbeat */}
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Radio size={14} className="shrink-0 text-ng-accent" aria-hidden />
          <h3 className="text-ng-base font-semibold text-ng-primary">Autonomous scan</h3>
        </div>
        {lastScan ? (
          <p className="mt-2 text-ng-sm leading-relaxed text-ng-secondary">
            <span className="text-ng-primary">{lastScan.action_label ?? lastScan.action}</span>
            {gapCount !== null && scannedCount !== null ? (
              <>
                {" "}
                — found {gapCount} of {scannedCount} sourcing lane(s) over threshold
              </>
            ) : null}
            {scanSeconds !== null ? <> · last scan {agoInWords(scanSeconds)}</> : null}
          </p>
        ) : (
          <p className="mt-2 text-ng-sm text-ng-secondary">Waiting for the first scan…</p>
        )}
        {nextInSeconds !== null ? (
          <p
            className="mt-1 text-ng-xs text-ng-disabled"
            title="The loop ticks on a fixed interval from server start and skips a tick if still running — this is an estimate, not a countdown to an exact event."
          >
            next in ~{Math.max(0, nextInSeconds)}s (estimate)
          </p>
        ) : null}
      </div>

      {/* Right: worst-of-N rollup across every domain that has a page */}
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Activity size={14} className="shrink-0 text-ng-accent" aria-hidden />
          <h3 className="text-ng-base font-semibold text-ng-primary">Across the region</h3>
        </div>
        {analyses === undefined ? (
          <Skeleton className="mt-2 h-16" />
        ) : domains.length === 0 ? (
          <p className="mt-2 text-ng-sm text-ng-secondary">No domain readings yet.</p>
        ) : (
          <>
            <p
              className={cn(
                "mt-2 text-ng-sm font-semibold",
                worst ? SEVERITY_TONE[worst] : "text-ng-success-tx"
              )}
            >
              {headline}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {domains.map((a) => {
                const domainWorst = worstSeverity(a.findings);
                const page = pageForDomain(a.domain);
                const label = page ? findPage(page).label : a.domain;
                return (
                  <button
                    key={a.domain}
                    onClick={() => page && onNavigate(page)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ng-border bg-ng-bg px-2 py-1 text-ng-2xs text-ng-secondary transition-colors hover:border-ng-accent hover:text-ng-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
                  >
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background: domainWorst
                          ? SEVERITY_COLOR[domainWorst]
                          : "var(--color-success)",
                      }}
                    />
                    {label}
                    <span className="tabular-nums text-ng-disabled">{a.findings.length}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
