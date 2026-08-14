"use client";

import { api } from "../api";
import { AnalysisSection } from "../components/analysis/AnalysisSection";
import { Skeleton } from "../components/ui/skeleton";
import { usePoll } from "../hooks";

/**
 * Every agent's conclusions in one place.
 *
 * The four Intelligence pages each show one specialist's reading. This is
 * where those readings are compared — which domain raised the most, how
 * severity sits against confidence across all of them, how suppliers scored,
 * and what humans answered at the gate.
 *
 * It does not wait for a sweep. The dashboard holds its findings back because
 * they are the output of a run being watched; these are the standing readings,
 * and a reader who navigated here should not be sent elsewhere first.
 */
export function ImpactView() {
  const { data, error, updatedAt, refreshing, intervalMs } = usePoll(
    () => api.analysisOverview(),
    30_000
  );

  if (error) {
    return (
      <p className="rounded-md border border-ng-warning-bd bg-ng-warning-bg px-4 py-3 text-sm text-ng-warning-tx">
        Failed to load the analysis: {error}
      </p>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16" />
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <AnalysisSection
      data={data}
      live={{ updatedAt, refreshing, intervalMs }}
    />
  );
}
