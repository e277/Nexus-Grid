"use client";

import { Activity } from "lucide-react";

import { api } from "../api";
import { ActivityTimeline } from "../components/charts/ActivityTimeline";
import { CoverageNote } from "../components/CoverageNote";
import { LiveIndicator } from "../components/LiveIndicator";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Pagination, usePagination } from "../components/ui/pagination";
import { Skeleton } from "../components/ui/skeleton";
import { usePoll } from "../hooks";
import { cn } from "../lib/utils";

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "unknown";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function confidenceBand(value: number): "success" | "warning" | "muted" {
  if (value >= 0.8) return "success";
  if (value >= 0.5) return "warning";
  return "muted";
}

/**
 * Every action an agent has taken, in the order it took them.
 *
 * This is the platform's own record rather than a reading of anyone's data:
 * which specialist acted, what it decided, how confident it was, and when. A
 * coordination layer that cannot show its own working is asking to be trusted
 * on the strength of its conclusions alone.
 *
 * The scan that finds nothing is recorded next to the scan that finds a gap.
 * An activity log that only kept the interesting entries would make the
 * platform look busier than it is and hide the intervals where it saw nothing
 * worth acting on.
 */
export function VisibilityView() {
  const { data, error, updatedAt, refreshing, intervalMs } = usePoll(
    () => api.agentActivities({ limit: 100 }),
    20_000
  );

  const entries = data ?? [];
  const paged = usePagination(entries, 25, entries.length);

  if (error) {
    return (
      <p className="rounded-md border border-ng-warning-bd bg-ng-warning-bg px-4 py-3 text-sm text-ng-warning-tx">
        Failed to load the activity trail: {error}
      </p>
    );
  }

  if (!data) return <Skeleton className="h-72" />;

  const byAgent = new Map<string, number>();
  for (const entry of data) {
    const title = entry.agent_title ?? entry.agent_name;
    byAgent.set(title, (byAgent.get(title) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <CoverageNote
        level="partial"
        covered={
          <>
            End-to-end visibility of the <span className="font-medium">coordination</span>:
            every action each agent took, what it decided, how confident it was and when,
            including the scans that found nothing. The decisions taken at the approval
            gate are on the dashboard.
          </>
        }
        missing={
          <>
            Tracking food. No consignment, shipment or delivery is followed from farm to
            market anywhere in this platform, and nothing here reports where a physical
            good is.
          </>
        }
        requires={
          <>
            Consignment-level events from carriers, ports or distributors — the scans and
            status updates that make a shipment traceable. None is published as an open
            feed for the region, and trade statistics record a border crossing after the
            fact rather than a movement as it happens.
          </>
        }
      />

      <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <Activity size={14} className="shrink-0 text-ng-secondary" aria-hidden />
        <span className="text-ng-base font-semibold text-ng-primary">
          {data.length} recorded actions
        </span>
        {[...byAgent.entries()].map(([agent, count]) => (
          <span key={agent} className="text-ng-xs text-ng-secondary">
            {agent} <span className="tabular-nums text-ng-primary">{count}</span>
          </span>
        ))}
        <LiveIndicator
          className="ml-auto"
          updatedAt={updatedAt}
          refreshing={refreshing}
          intervalMs={intervalMs}
        />
      </Card>

      {data.length > 0 ? <ActivityTimeline activities={data} /> : null}

      {data.length === 0 ? (
        <Card className="p-6">
          <p className="text-ng-sm text-ng-secondary">
            No agent has acted yet. The scan loop records an entry each cycle, including the
            cycles where it finds nothing.
          </p>
        </Card>
      ) : (
        <div className="rounded-[10px] border border-ng-border bg-ng-surface">
          <div className="max-h-[65vh] overflow-auto">
          <table className="w-full min-w-[680px] text-left">
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
                {["Agent", "Action", "Confidence", "When"].map((column, i) => (
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
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.pageItems.map((entry, index) => (
                <tr
                  key={entry.id}
                  className={cn(
                    "border-b border-ng-border last:border-0",
                    index % 2 === 1 && "bg-ng-row-alt"
                  )}
                >
                  {/* Absolute across pages, so a row keeps its number. */}
                  <td className="whitespace-nowrap px-3 py-2 text-right text-ng-2xs tabular-nums text-ng-disabled">
                    {paged.from + index}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-ng-sm font-medium text-ng-primary">
                    {entry.agent_title ?? entry.agent_name}
                  </td>
                  <td className="px-3 py-2 text-ng-sm leading-snug text-ng-secondary">
                    {entry.action_label ?? entry.action}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {/* Zero confidence is a real answer — the scan that found
                        nothing is as much a record as the one that did — so it
                        prints rather than reading as missing. */}
                    <Badge size="sm" variant={confidenceBand(entry.confidence ?? 0)}>
                      {Math.round((entry.confidence ?? 0) * 100)}%
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-ng-xs tabular-nums text-ng-secondary">
                    {entry.created_at ? ago(entry.created_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <Pagination
            {...paged}
            onPage={paged.setPage}
            onPageSize={paged.setPageSize}
            noun="actions"
          />
        </div>
      )}
    </div>
  );
}
