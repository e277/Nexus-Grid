"use client";

import { useState } from "react";

import { api } from "../api";
import { AnalysisView } from "../components/AnalysisView";
import { SourceBar, type SourceUse } from "../components/SourceBar";
import { usePoll } from "../hooks";
import type { AnalysisDomain } from "../types";

/**
 * Every intelligence page, which is the same page against a different domain.
 *
 * The console used to render the projection: stat tiles of trade totals, a
 * stacked bar of import values, a matrix of external shares, a sortable table
 * of every gap. All of it correct, and all of it something a member state can
 * already produce from its own systems. What it cannot produce is what those
 * figures mean *together*, which is the only thing this platform exists to
 * say — so the page is now the agent's reading, and the numbers appear as the
 * evidence each finding cites.
 *
 * Provenance stays. It is not page content in the sense being replaced: it is
 * what tells a reader which publishers the agent was working from, and which
 * of its conclusions are standing on a source that was down.
 */
export function IntelligenceView({
  domain,
  uses,
}: {
  domain: AnalysisDomain;
  /** The publishers this domain reads, and what each contributes to it. */
  uses: SourceUse[];
}) {
  // Polled rather than fetched once: the first read returns rule-derived
  // findings immediately and starts the model call behind it, so the poll is
  // what swaps in the agent's reading when it lands.
  const { data, error, refresh } = usePoll(() => api.analysis(domain), 20_000);
  const [rereading, setRereading] = useState(false);

  async function reread() {
    setRereading(true);
    try {
      await api.analysis(domain, true);
      refresh();
    } catch {
      // The panel keeps showing the last reading; the poll retries.
    } finally {
      setRereading(false);
    }
  }

  if (error) {
    return (
      <p className="rounded-md border border-ng-warning-bd bg-ng-warning-bg px-4 py-3 text-sm text-ng-warning-tx">
        Failed to load the analysis: {error}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {data ? <SourceBar sources={data.sources} uses={uses} /> : null}
      <AnalysisView
        analysis={data?.analysis ?? null}
        onRefresh={reread}
        refreshing={rereading}
      />
    </div>
  );
}
