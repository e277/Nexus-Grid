"use client";

import { useState } from "react";

import { SupplierScoreChart } from "../charts/AgentCharts";
import { compact } from "../charts/chart-kit";
import { SupplierCoverageChart } from "../charts/SupplierCoverageChart";
import { Kpi, KpiStrip } from "./KpiStrip";
import type { AnalysisOverview } from "../../types";

/**
 * The substitution case, on the page about substitution.
 *
 * Every figure here is about which commodity a member state buys outside the
 * region while a neighbour already supplies it, which is precisely what the
 * Farm-to-Market agent reads — so the finding and the figures that size it sit
 * on one page.
 *
 * The addressable total leads, because it is the outcome the whole platform
 * argues for — not a count of what the agents produced while arguing it.
 */
export function SourcingAnalysis({ data }: { data: AnalysisOverview }) {
  /** `importer_iso3-commodity_code` of the gap whose breakdown is open. */
  const [gapKey, setGapKey] = useState<string | null>(null);

  const addressableUsd = data.matches.reduce((sum, m) => sum + m.external_usd, 0);
  const coverage = data.matches.filter((m) => m.matches.length > 0);
  const bestScores = coverage.map((m) => m.matches[0].score);
  const medianCoverage =
    bestScores.length > 0
      ? [...bestScores].sort((a, b) => a - b)[Math.floor(bestScores.length / 2)]
      : null;
  const openGap = coverage.find((m) => `${m.importer_iso3}-${m.commodity_code}` === gapKey);

  if (data.matches.length === 0) return null;

  return (
    <div className="space-y-4">
      <KpiStrip variant="supporting">
        <Kpi
          label="Addressable imports"
          value={compact(addressableUsd)}
          tone="success"
          hint={`${data.matches.length} commodity–importer pairs a member state already supplies`}
        />
        <Kpi
          label="Gaps with a regional match"
          value={`${coverage.length} / ${data.matches.length}`}
          hint={
            coverage.length === data.matches.length
              ? "every gap has a scored alternative"
              : "the rest have no scored regional supplier"
          }
        />
        <Kpi
          label="Median match score"
          value={medianCoverage === null ? "—" : `${medianCoverage}`}
          hint={
            medianCoverage === null
              ? "no gap has a scored supplier"
              : "best regional supplier, out of 100"
          }
        />
      </KpiStrip>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <SupplierCoverageChart matches={data.matches} selected={gapKey} onSelect={setGapKey} />
        </div>
        <div className="lg:col-span-5">
          <SupplierScoreChart match={openGap ?? coverage[0] ?? null} />
        </div>
      </div>
    </div>
  );
}
