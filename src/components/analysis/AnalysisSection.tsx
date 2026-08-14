"use client";

import { Filter, Send, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AgentDecisionChart,
  ConfidenceChart,
  FindingsByDomainChart,
  GateOutcomeChart,
  SupplierScoreChart,
} from "../charts/AgentCharts";
import { SEVERITY_COLOR } from "../charts/chart-kit";
import { SupplierCoverageChart } from "../charts/SupplierCoverageChart";
import {
  FindingsBoard,
  FindingsMatrix,
  type TaggedFinding,
} from "../charts/FindingsBoard";
import { SourceBar } from "../SourceBar";
import { Kpi, KpiStrip } from "./KpiStrip";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { PillTabs, type PillOption } from "../ui/tabs";
import { cn } from "../../lib/utils";
import { ANALYSIS_SOURCES } from "../../source-map";
import type { AnalysisOverview, DispatchReadiness, FindingSeverity } from "../../types";

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

type Severity = "all" | "critical" | "opportunity" | "watch" | "gap";

/**
 * Everything the agents concluded, as charts you can cut.
 *
 * This was a second page. It is a section of the dashboard now, because the
 * split asked an operator to leave the run in order to see what the run
 * produced — the findings, the supplier scores and the gate history are the
 * output of the loop above them, not a separate subject.
 *
 * Every series here is agent output — findings the agents raised, the
 * confidence they attached, the scores they gave suppliers, the answers humans
 * gave at the gate. None of it plots a publisher's data directly; the figures
 * behind a finding are in that finding's evidence, beside the conclusion they
 * support.
 *
 * One filter row scopes everything below it, and the charts cross-filter: a
 * domain picked here, or a bar clicked in the chart, narrows every other chart
 * and the findings list together. Every chart prints its numbers as a table
 * beneath it and every finding prints its evidence — shown rather than folded
 * behind a disclosure, because a value a reader has to open is a value most
 * readers never see.
 */
export function AnalysisSection({ data }: { data: AnalysisOverview }) {
  const [domain, setDomain] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity>("all");
  /** A cell picked in the severity-by-confidence matrix. */
  const [cell, setCell] = useState<{ severity: FindingSeverity; confidence: string } | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<number | null>(null);
  /** `importer_iso3-commodity_code` of the gap whose breakdown is open. */
  const [gapKey, setGapKey] = useState<string | null>(null);

  const allFindings: TaggedFinding[] = useMemo(
    () =>
      (data?.analyses ?? []).flatMap((analysis) =>
        analysis.findings.map((finding) => ({ ...finding, domain: analysis.domain }))
      ),
    [data]
  );

  const filtered = useMemo(
    () =>
      allFindings.filter(
        (finding) =>
          (domain === null || finding.domain === domain) &&
          (severity === "all" || finding.severity === severity) &&
          (cell === null ||
            (finding.severity === cell.severity && finding.confidence === cell.confidence))
      ),
    [allFindings, domain, severity, cell]
  );


  const interpreted = data.analyses.filter((a) => a.source !== "rules").length;
  const criticals = allFindings.filter((f) => f.severity === "critical").length;
  const allModelRead = interpreted === data.analyses.length;
  const approved = data.gate_decisions.filter(
    (g) => g.decision === "approved" || g.decision === "modified"
  ).length;
  const coverage = data.matches.filter((m) => m.matches.length > 0);
  const bestScores = coverage.map((m) => m.matches[0].score);
  const medianCoverage =
    bestScores.length > 0
      ? [...bestScores].sort((a, b) => a - b)[Math.floor(bestScores.length / 2)]
      : null;
  const openGap = coverage.find(
    (m) => `${m.importer_iso3}-${m.commodity_code}` === gapKey
  );
  const scored = data.decisions.filter((d) => typeof d.confidence === "number");
  const meanConfidence =
    scored.length > 0
      ? Math.round((scored.reduce((sum, d) => sum + (d.confidence ?? 0), 0) / scored.length) * 100)
      : null;


  const domainOptions: PillOption<string>[] = [
    { value: "all", label: "All domains", count: allFindings.length },
    ...data.analyses.map((analysis) => ({
      value: analysis.domain,
      label: DOMAIN_LABEL[analysis.domain] ?? analysis.domain,
      count: analysis.findings.length,
    })),
  ];

  const severityOptions: PillOption<Severity>[] = [
    { value: "all", label: "Any severity" },
    ...(["critical", "opportunity", "watch", "gap"] as const).map((s) => ({
      value: s,
      label: SEVERITY_LABEL[s],
      dot: SEVERITY_COLOR[s],
      count: allFindings.filter((f) => f.severity === s).length,
    })),
  ];

  const filtersActive = domain !== null || severity !== "all" || cell !== null;

  return (
    <div className="space-y-4">
      {/* ── The headline row ──────────────────────────────────────────────
             Five figures a reader should be able to take without reading a
             chart. Each is said once here and explained by exactly one chart
             below, rather than restated by several. */}
      <KpiStrip>
        <Kpi
          label="Findings raised"
          value={allFindings.length}
          hint={`across ${data.analyses.length} specialist agents`}
        />
        <Kpi
          label="Rated critical"
          value={criticals}
          tone={criticals > 0 ? "danger" : "success"}
          hint={criticals > 0 ? "needs a decision first" : "nothing critical right now"}
        />
        <Kpi
          label="Mean confidence"
          value={meanConfidence === null ? "—" : `${meanConfidence}%`}
          hint={
            meanConfidence === null
              ? "no decision has been scored"
              : `across ${data.decisions.length} agent decisions`
          }
        />
        <Kpi
          label="Median coverage"
          value={medianCoverage === null ? "—" : `${medianCoverage}`}
          hint={
            medianCoverage === null
              ? "no gap has a scored supplier"
              : `best regional match, ${coverage.length} gaps scored`
          }
        />
        <Kpi
          label="Gate decisions"
          value={data.gate_decisions.length}
          tone={data.gate_decisions.length === 0 ? "neutral" : "success"}
          hint={
            data.gate_decisions.length === 0
              ? "no run has reached the gate"
              : `${approved} approved or amended`
          }
        />
      </KpiStrip>

      {/* Who produced these readings, said once and up front — a rule-derived
          fallback is not a model's judgement, and the difference belongs
          beside the numbers rather than buried per chart. */}
      <p className="text-ng-2xs text-ng-secondary">
        {allModelRead
          ? `All ${data.analyses.length} domain readings below came from a model.`
          : `${interpreted} of ${data.analyses.length} domain readings came from a model; the rest are rule-derived fallbacks.`}
      </p>

      {/* ── One filter row, scoping everything below it ─────────────────── */}
      <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2.5">
        <Filter size={13} className="shrink-0 text-ng-secondary" aria-hidden />
        <PillTabs
          label="Filter findings by domain"
          options={domainOptions}
          value={domain ?? "all"}
          onChange={(value) => setDomain(value === "all" ? null : value)}
        />
        <span aria-hidden className="hidden h-4 w-px bg-ng-border sm:block" />
        <PillTabs
          label="Filter findings by severity"
          options={severityOptions}
          value={severity}
          onChange={setSeverity}
        />
        {filtersActive ? (
          <button
            onClick={() => {
              setDomain(null);
              setSeverity("all");
              setCell(null);
              setSelectedFinding(null);
            }}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-ng-border px-2.5 py-1 text-ng-2xs font-semibold text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
          >
            <X size={10} aria-hidden />
            Clear · {filtered.length} of {allFindings.length}
          </button>
        ) : null}
      </Card>

      {/* ── The grid ──────────────────────────────────────────────────────
             Twelve columns, so a chart can take the width its shape needs
             rather than an even half. The two that answer "what did the
             agents find" lead; the three that answer "what was done about
             it" sit under them at a third each. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <FindingsByDomainChart analyses={data.analyses} selected={domain} onSelect={setDomain} />
        </div>
        <div className="lg:col-span-5">
          <FindingsMatrix findings={filtered} onSelect={setCell} selected={cell} />
        </div>

        <div className="lg:col-span-4">
          <ConfidenceChart findings={filtered} />
        </div>
        <div className="lg:col-span-4">
          <AgentDecisionChart decisions={data.decisions} />
        </div>
        <div className="lg:col-span-4">
          <GateOutcomeChart gateDecisions={data.gate_decisions} />
        </div>

        {/* Coverage across every gap, then the breakdown for the one picked.
            This was one stacked chart per gap, twelve deep — the comparison
            they were each answering separately is a single question, and
            scrolling between them was the only way to ask it. */}
        {coverage.length > 0 ? (
          <div className="lg:col-span-7">
            <SupplierCoverageChart matches={data.matches} selected={gapKey} onSelect={setGapKey} />
          </div>
        ) : null}
        {coverage.length > 0 ? (
          <div className="lg:col-span-5">
            <SupplierScoreChart match={openGap ?? coverage[0]} />
          </div>
        ) : null}
      </div>

      <div>
        <h2 className="text-ng-base font-bold tracking-tight text-ng-primary">
          {filtered.length} finding{filtered.length === 1 ? "" : "s"}
          {filtersActive ? " matching the filters" : ""}
        </h2>
        <p className="mt-0.5 text-ng-sm text-ng-secondary">
          Each tile leads with the figure the agent attached to it. Select one for the reasoning
          and the evidence behind it.
        </p>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-ng-secondary">No finding matches these filters.</p>
        </Card>
      ) : (
        <>
          <FindingsBoard
            findings={filtered}
            selectedIndex={selectedFinding}
            onSelect={setSelectedFinding}
          />
        </>
      )}

      {/* Every publisher behind the comparison, linked out. */}
      <SourceBar sources={data.sources} uses={ANALYSIS_SOURCES} />
    </div>
  );
}

/**
 * Whether an approved plan has anywhere to go.
 *
 * The gate is the point of the whole loop, and a plan approved into a
 * deployment with no delivery channel goes nowhere — the run reports
 * `simulated` and the console previously said so only in the run's own result
 * panel, one page away and only after a run. Named here as a standing status,
 * with the exact variables still unset rather than a general complaint that
 * something is unconfigured.
 */
export function DispatchPanel({ dispatch }: { dispatch: DispatchReadiness }) {
  const ready = dispatch.status === "ready";

  return (
    <Card
      className={cn(
        "p-4",
        ready
          ? "border-ng-success-bd/70 bg-gradient-to-br from-ng-success-bg to-ng-surface"
          : "border-ng-warning-bd/70 bg-gradient-to-br from-ng-warning-bg to-ng-surface"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Send size={14} className="shrink-0 text-ng-secondary" aria-hidden />
        <h3 className="text-ng-base font-semibold text-ng-primary">Plan delivery</h3>
        <Badge variant={ready ? "success" : "warning"} size="sm">
          {ready ? "Ready" : "Not configured"}
        </Badge>
        {ready && dispatch.target ? (
          <span className="text-ng-xs text-ng-secondary">
            approved plans go to{" "}
            <span className="font-mono text-ng-primary">{dispatch.target}</span> via agent{" "}
            <span className="font-mono text-ng-primary">{dispatch.agent_id}</span>
          </span>
        ) : null}
      </div>

      {ready ? (
        <p className="mt-2 max-w-3xl text-ng-sm leading-relaxed text-ng-secondary">
          An approved or amended plan is delivered to a running OpenClaw gateway. Rejected and
          escalated plans are never sent — they are decisions not to act.
        </p>
      ) : (
        <>
          <p className="mt-2 max-w-3xl text-ng-sm leading-relaxed text-ng-secondary">
            Approved plans have nowhere to go, so the execute step reports its dispatch as
            simulated rather than claiming a delivery.
          </p>
          {/* Which environment these belong to, because the gateway is a
              separate process and is usually configured somewhere else
              entirely — a container, a service, another host. Setting them
              there instead of here is the obvious wrong turn, and this panel
              is where a reader decides which one to open. */}
          <p className="mt-1.5 max-w-3xl text-ng-sm leading-relaxed text-ng-secondary">
            These belong to <span className="font-medium text-ng-primary">this app</span>, in its
            own <span className="font-mono">.env</span> — not to the gateway, which keeps its own
            configuration and owns the channel itself. They are read once at startup, so restart
            the server after setting one.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {dispatch.missing.map((setting) => (
              <li key={setting.key} className="text-ng-sm leading-snug">
                <span className="font-mono font-semibold text-ng-warning-tx">{setting.key}</span>
                <span className="text-ng-secondary"> — {setting.describes}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

