"use client";

import { ExternalLink, RefreshCw, TriangleAlert } from "lucide-react";

import { cn } from "../lib/utils";
import type { SourceProvenance, SourceSlot } from "../types";

const STATUS_DOT: Record<SourceProvenance["status"], string> = {
  live: "bg-ng-success",
  cached: "bg-ng-info",
  empty: "bg-ng-muted-bd",
  pending: "bg-ng-info animate-pulse",
  unauthorized: "bg-ng-warning",
  unavailable: "bg-ng-danger",
};

const STATUS_LABEL: Record<SourceProvenance["status"], string> = {
  live: "live",
  cached: "cached",
  empty: "no data",
  pending: "fetching",
  unauthorized: "no credentials",
  unavailable: "down",
};

const STATUS_MEANING: Record<SourceProvenance["status"], string> = {
  live: "Fetched from the publisher on the last sweep.",
  cached: "Publisher unreachable — showing the last good snapshot.",
  empty: "Reachable, but returned nothing usable.",
  pending: "First fetch still in progress.",
  unauthorized: "Requires credentials this deployment does not have.",
  unavailable: "Publisher failed on the last sweep.",
};

/** A source this page reads, and what it contributes *here*. */
export interface SourceUse {
  slot: SourceSlot;
  contributes: string;
}

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
 * Per-page source attribution: who published the numbers *on this page*, what
 * each one contributed, under what terms, and how stale it is.
 *
 * Every page names only the sources its own figures come from. A bar that
 * listed all six everywhere would be decoration — it would tell a reader
 * looking at a planting calendar that a hurricane feed was involved, and it
 * would hide the thing that actually matters, which is that *this* page's
 * numbers degrade when *that* publisher is down.
 */
export function SourceBar({
  sources,
  uses,
  onRefresh,
  refreshing,
}: {
  /** Every provenance record the API returned. */
  sources: SourceProvenance[];
  /** The slots this page actually reads, in the order they matter here. */
  uses: SourceUse[];
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const bySlot = new Map(sources.map((s) => [s.slot, s]));
  const rows = uses
    .map((use) => ({ use, source: bySlot.get(use.slot) }))
    .filter((row): row is { use: SourceUse; source: SourceProvenance } => row.source !== undefined);

  if (rows.length === 0) return null;

  const degraded = rows.filter((r) => r.source.status !== "live" && r.source.status !== "pending");
  const oldest = rows.reduce<string | null>(
    (acc, r) =>
      acc === null || new Date(r.source.fetched_at) < new Date(acc) ? r.source.fetched_at : acc,
    null
  );

  return (
    <section
      aria-label="Sources for this page"
      className="overflow-hidden rounded-xl bg-ng-surface shadow-ng-sm"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ng-border/15 px-4 py-2">
        <h2 className="text-ng-2xs font-bold uppercase tracking-[.7px] text-ng-secondary">
          Sources on this page
        </h2>
        <span className="text-ng-2xs text-ng-secondary">
          {rows.length} publisher{rows.length === 1 ? "" : "s"} · open data, used under each
          publisher&rsquo;s own terms
        </span>
        <span className="ml-auto flex items-center gap-2.5">
          {oldest ? (
            <span className="text-ng-2xs text-ng-secondary">Oldest fetch {agoInWords(oldest)}</span>
          ) : null}
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
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          ) : null}
        </span>
      </div>

      {/* Two columns from `lg`: six publishers down one column is six
          wrapped sentences, and this sits at the foot of a page that is
          already long. */}
      <ul className="grid grid-cols-1 gap-px bg-ng-border lg:grid-cols-2">
        {rows.map(({ use, source }) => (
          <li key={use.slot} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 bg-ng-surface px-4 py-2">
            <span
              aria-hidden
              className={cn(
                "relative top-[-1px] h-1.5 w-1.5 shrink-0 rounded-full",
                STATUS_DOT[source.status]
              )}
            />
            {source.documentation ? (
              <a
                href={source.documentation}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex shrink-0 items-center gap-1 text-ng-sm font-semibold text-ng-primary underline decoration-dotted underline-offset-2 hover:decoration-solid focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
              >
                {source.publisher}
                <ExternalLink size={10} aria-hidden />
              </a>
            ) : (
              <span className="shrink-0 text-ng-sm font-semibold text-ng-primary">
                {source.publisher}
              </span>
            )}

            <span
              className={cn(
                "shrink-0 text-ng-2xs font-semibold uppercase tracking-[.5px]",
                source.status === "live"
                  ? "text-ng-success-tx"
                  : source.status === "cached" || source.status === "pending"
                    ? "text-ng-info-tx"
                    : "text-ng-danger-tx"
              )}
              title={STATUS_MEANING[source.status]}
            >
              {STATUS_LABEL[source.status]}
            </span>

            <span className="ml-auto shrink-0 text-ng-2xs tabular-nums text-ng-secondary">
              {source.records.toLocaleString()} records · {agoInWords(source.fetched_at)}
            </span>

            {/* What it contributed here, on its own line under the publisher:
                it is the reason the citation is worth reading, so it stays
                visible rather than moving into a title. */}
            <span className="w-full text-ng-xs leading-snug text-ng-secondary">
              {use.contributes}
            </span>
          </li>
        ))}
      </ul>

      {/* A degraded publisher is stated here rather than left for the reader to
          infer from a figure that quietly got smaller. */}
      {degraded.length > 0 ? (
        <div className="border-t border-ng-border bg-ng-warning-bg px-4 py-2">
          {degraded.map(({ use, source }) => (
            <p
              key={use.slot}
              className="flex items-start gap-1.5 text-ng-xs leading-relaxed text-ng-warning-tx"
            >
              <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">{source.publisher}</span> is{" "}
                {STATUS_LABEL[source.status]} — {STATUS_MEANING[source.status].toLowerCase()}{" "}
                {use.contributes.charAt(0).toLowerCase() + use.contributes.slice(1)} is missing or
                stale on this page.
                {source.note ? ` ${source.note}` : ""}
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
