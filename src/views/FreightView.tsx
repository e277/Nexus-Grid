"use client";

import { Ship } from "lucide-react";
import { useMemo } from "react";

import { api } from "../api";
import { CaribbeanMap } from "../components/charts/CaribbeanMap";
import { CoverageNote } from "../components/CoverageNote";
import { LiveIndicator } from "../components/LiveIndicator";
import { SourceBar } from "../components/SourceBar";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Pagination, usePagination } from "../components/ui/pagination";
import { ScrollFade } from "../components/ui/scroll-fade";
import { Skeleton } from "../components/ui/skeleton";
import { usePoll } from "../hooks";
import { cn } from "../lib/utils";
import { LOGISTICS_SOURCES } from "../source-map";
import type { Lane } from "../types";

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" }> = {
  clear: { label: "Clear", tone: "success" },
  watch: { label: "Watch", tone: "warning" },
  at_risk: { label: "At risk", tone: "danger" },
};

function usd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${Math.round(value / 1_000_000)}M`;
  return `$${value.toLocaleString()}`;
}

/**
 * Which supplier can actually reach which importer, and at what cost in hours.
 *
 * A lane is a match the platform scored, not a carrier's published schedule:
 * the commodity, the two member states, the sea distance between their ports,
 * the transit that implies, and live weather at both ends. Sorted by the value
 * the lane could displace, so the freight worth arranging first is at the top.
 *
 * `geo-estimate` is stated on every row that carries one. No free inter-island
 * freight API exists, so transit is derived from real port coordinates and a
 * documented average speed — which is a defensible estimate and a dishonest
 * booking, so it is labelled as the former.
 */
export function FreightView() {
  const { data, error, updatedAt, refreshing, intervalMs } = usePoll(
    () => api.lanes(),
    30_000
  );

  // Sorted before paging: the window has to be onto a stable order, or a row
  // moves between pages as the poll refreshes.
  const lanes = useMemo(
    () => [...(data?.lanes ?? [])].sort((a, b) => b.external_usd - a.external_usd),
    [data]
  );
  const paged = usePagination(lanes, 25, lanes.length);

  if (error) {
    return (
      <p className="rounded-md border border-ng-warning-bd bg-ng-warning-bg px-4 py-3 text-sm text-ng-warning-tx">
        Failed to load the lanes: {error}
      </p>
    );
  }

  if (!data) return <Skeleton className="h-72" />;

  const atRisk = lanes.filter((l) => l.status === "at_risk").length;
  const fastest = lanes.reduce<Lane | null>(
    (best, l) => (best === null || l.transit_hours < best.transit_hours ? l : best),
    null
  );

  return (
    <div className="space-y-4">
      <CoverageNote
        level="partial"
        covered={
          <>
            Every supplier–importer lane scored and ranked by the value it could displace,
            with sea distance between real port coordinates, the transit that implies, and
            live weather at both ends setting each lane&rsquo;s status.
          </>
        }
        missing={
          <>
            Freight capacity and route optimisation. Nothing here knows what space is
            available on a sailing, when the next one leaves, or what a route would cost —
            and no lane is optimised against alternatives, because there is one sea path
            between two islands and the estimate is of that path.
          </>
        }
        requires={
          <>
            Carrier schedules and vessel capacity, or an AIS feed. No free inter-island
            freight API publishes them for this region; AIS providers that would are
            credentialed. The supplier ranking already lists vessel capacity and sailing
            schedules among the factors it refuses to score, rather than weighting a guess.
          </>
        }
      />

      <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <Ship size={14} className="shrink-0 text-ng-secondary" aria-hidden />
        <span className="text-ng-base font-semibold text-ng-primary">
          {lanes.length} scored lanes
        </span>
        <span className="text-ng-sm text-ng-secondary">
          {atRisk} at risk from weather at one or both ends
        </span>
        {fastest ? (
          <span className="text-ng-sm text-ng-secondary">
            Shortest transit {Math.round(fastest.transit_hours)}h ·{" "}
            {fastest.supplier} → {fastest.importer}
          </span>
        ) : null}
        <LiveIndicator
          className="ml-auto"
          updatedAt={updatedAt}
          refreshing={refreshing}
          intervalMs={intervalMs}
        />
      </Card>

      <CaribbeanMap lanes={lanes} ports={data.ports ?? []} />

      <div className="rounded-xl bg-ng-surface shadow-ng-sm">
        {/* Scrolls in both directions with a capped height, which is what lets
            the header stick: `position: sticky` resolves against the nearest
            scrollport, so a container that only scrolled sideways would pin
            the header to a box that never moves vertically. */}
        <ScrollFade className="max-h-[65vh] overflow-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead>
            <tr>
              <th
                scope="col"
                className={cn(
                  "w-10 px-3 py-2 text-right text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary",
                  "sticky top-0 z-10 bg-ng-surface border-b border-ng-border"
                )}
              >
                <span aria-hidden>#</span>
                <span className="sr-only">Row number</span>
              </th>
              {["Lane", "Commodity", "Distance", "Transit", "Weather", "Displaces"].map(
                (column, i) => (
                  <th
                    key={column}
                    className={cn(
                      "px-3 py-2 text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary",
                      "sticky top-0 z-10 bg-ng-surface border-b border-ng-border",
                      i >= 2 && "text-right"
                    )}
                  >
                    {column}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {paged.pageItems.map((lane, index) => (
              <tr
                key={`${lane.supplier_iso3}-${lane.importer_iso3}-${lane.commodity}`}
                className={cn(
                  "border-b border-ng-border last:border-0",
                  index % 2 === 1 && "bg-ng-row-alt"
                )}
              >
                {/* Absolute, not per-page: a number that restarted at 1 on
                    every page would say nothing about where a row sits in the
                    sixty. */}
                <td className="whitespace-nowrap px-3 py-2 text-right text-ng-2xs tabular-nums text-ng-disabled">
                  {paged.from + index}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-ng-sm font-medium text-ng-primary">
                  {lane.supplier} → {lane.importer}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-ng-xs text-ng-secondary">
                  {lane.commodity}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-ng-xs tabular-nums text-ng-secondary">
                  {lane.distance_km === null ? "—" : `${Math.round(lane.distance_km)} km`}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-ng-sm tabular-nums text-ng-primary">
                  {Math.round(lane.transit_hours)}h
                  <span className="ml-1 text-ng-2xs text-ng-disabled">
                    {lane.estimate_source === "geo-estimate" ? "est." : ""}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <Badge size="sm" variant={STATUS[lane.status]?.tone ?? "muted"}>
                    {STATUS[lane.status]?.label ?? lane.status}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-ng-sm tabular-nums text-ng-primary">
                  {usd(lane.external_usd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </ScrollFade>
        <Pagination {...paged} onPage={paged.setPage} onPageSize={paged.setPageSize} noun="lanes" />
      </div>

      <SourceBar sources={data.sources ?? []} uses={LOGISTICS_SOURCES} />
    </div>
  );
}
