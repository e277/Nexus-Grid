"use client";

import { Brain, Filter, Send, Sparkles, Target, X } from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "../api";
import {
  AgentDecisionChart,
  ConfidenceChart,
  FindingsByDomainChart,
  GateOutcomeChart,
  SupplierScoreChart,
} from "../components/charts/AgentCharts";
import { SEVERITY_COLOR } from "../components/charts/chart-kit";
import { FindingMetrics } from "../components/charts/FindingMetrics";
import {
  FindingsBoard,
  FindingsMatrix,
  type TaggedFinding,
} from "../components/charts/FindingsBoard";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { PillTabs, type PillOption } from "../components/ui/tabs";
import { usePoll } from "../hooks";
import { cn } from "../lib/utils";
import type { DispatchReadiness, FindingSeverity } from "../types";

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

type Severity = "all" | "critical" | "opportunity" | "watch" | "gap";

/**
 * The analysis page: everything the agents concluded, as charts you can cut.
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
export function ImpactView() {
  const { data, error } = usePoll(() => api.analysisOverview(), 30_000);

  const [domain, setDomain] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity>("all");
  /** A cell picked in the severity-by-confidence matrix. */
  const [cell, setCell] = useState<{ severity: FindingSeverity; confidence: string } | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<number | null>(null);

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

  // A tile index only means anything against the list it was picked from.
  const detail = selectedFinding !== null ? (filtered[selectedFinding] ?? null) : null;

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

  const interpreted = data.analyses.filter((a) => a.source !== "rules").length;
  const criticals = allFindings.filter((f) => f.severity === "critical").length;
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
    <div className="space-y-5">
      {/* ── What the agents have produced ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Findings raised"
          value={allFindings.length}
          hint={`across ${data.analyses.length} agents`}
          icon={<Sparkles size={13} />}
          tone="ai"
        />
        <Stat
          label="Rated critical"
          value={criticals}
          hint={criticals > 0 ? "needs a decision first" : "nothing critical right now"}
          icon={<Target size={13} />}
          tone={criticals > 0 ? "danger" : "success"}
        />
        <Stat
          label="Agent decisions"
          value={data.decisions.length}
          hint={meanConfidence === null ? "none scored yet" : `mean confidence ${meanConfidence}%`}
          icon={<Brain size={13} />}
          tone="info"
        />
        <Stat
          label="Domains read by a model"
          value={`${interpreted} / ${data.analyses.length}`}
          hint={
            interpreted === data.analyses.length
              ? "every page is a model reading"
              : "the rest are rule-derived"
          }
          icon={<Sparkles size={13} />}
          tone={interpreted === data.analyses.length ? "success" : "warning"}
        />
      </div>

      {/* ── One filter row, scoping everything below it ─────────────────── */}
      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={13} className="shrink-0 text-ng-secondary" aria-hidden />
          <span className="text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
            Domain
          </span>
          <PillTabs
            label="Filter findings by domain"
            options={domainOptions}
            value={domain ?? "all"}
            onChange={(value) => setDomain(value === "all" ? null : value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="ml-[21px] text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
            Severity
          </span>
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
              className="inline-flex items-center gap-1 rounded-full border border-ng-border px-2.5 py-1 text-ng-2xs font-semibold text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
            >
              <X size={10} aria-hidden />
              Clear · showing {filtered.length} of {allFindings.length}
            </button>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <FindingsByDomainChart
          analyses={data.analyses}
          selected={domain}
          onSelect={setDomain}
        />
        <ConfidenceChart findings={filtered} />
      </div>

      {/* ── The ranking the logistics agent works from ────────────────────
             Every gap, largest first, rather than one chosen from a dropdown.
             A picker made the reader ask for each answer one at a time and
             hid how many gaps there were; the point of the page is that they
             can be read against each other. */}
      {data.matches.length > 0 ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-ng-lg font-bold tracking-tight text-ng-primary">
              Supplier ranking — {data.matches.length} sourcing gap
              {data.matches.length === 1 ? "" : "s"}
            </h2>
            <p className="mt-0.5 max-w-3xl text-ng-sm text-ng-secondary">
              Every gap the agents found a regional supplier for, largest first. Each supplier is
              scored out of 100 on four observed factors.{" "}
              <span className="text-ng-primary">Not scored:</span>{" "}
              {data.matches[0].not_scored.join(" ")}
            </p>
          </div>

          {data.matches.map((match) => (
            <SupplierScoreChart
              key={`${match.importer_iso3}-${match.commodity_code}`}
              match={match}
            />
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <AgentDecisionChart decisions={data.decisions} />
        <GateOutcomeChart gateDecisions={data.gate_decisions} />
      </div>

      <DispatchPanel dispatch={data.dispatch} />

      {/* ── The findings, as a board rather than a document ───────────── */}
      <FindingsMatrix findings={filtered} onSelect={setCell} selected={cell} />

      <div>
        <h2 className="text-ng-lg font-bold tracking-tight text-ng-primary">
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
          {detail ? <FindingDetail finding={detail} /> : null}
        </>
      )}
    </div>
  );
}

/**
 * One finding in full: the agent's figures, its reasoning, and the evidence.
 *
 * Shown for the selected tile only. Twenty-four of these at once was the
 * document this page stopped being.
 */
function FindingDetail({ finding }: { finding: TaggedFinding }) {
  return (
    <Card className="border-ng-accent p-4 sm:p-5">
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
function DispatchPanel({ dispatch }: { dispatch: DispatchReadiness }) {
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
            simulated rather than claiming a delivery. Set these on the server and restart — a
            value added to <span className="font-mono">.env</span> after a build is not picked up
            by <span className="font-mono">next start</span>.
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

function Stat({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
  tone: "ai" | "danger" | "success" | "info" | "warning";
}) {
  const tint = {
    ai: "border-ng-ai-bd/70 bg-gradient-to-br from-ng-ai-bg to-ng-surface",
    danger: "border-ng-danger-bd/70 bg-gradient-to-br from-ng-danger-bg to-ng-surface",
    success: "border-ng-success-bd/70 bg-gradient-to-br from-ng-success-bg to-ng-surface",
    info: "border-ng-info-bd/70 bg-gradient-to-br from-ng-info-bg to-ng-surface",
    warning: "border-ng-warning-bd/70 bg-gradient-to-br from-ng-warning-bg to-ng-surface",
  }[tone];

  return (
    <Card className={cn("p-4", tint)}>
      <div className="flex items-center gap-1.5 text-ng-secondary">
        <span className="shrink-0">{icon}</span>
        <p className="text-ng-2xs font-bold uppercase tracking-[.6px]">{label}</p>
      </div>
      <p className="mt-1.5 text-ng-hero font-bold leading-none tracking-tight text-ng-primary">
        {value}
      </p>
      <p className="mt-2 text-ng-xs leading-snug text-ng-secondary">{hint}</p>
    </Card>
  );
}
