"use client";

import { Brain, Filter, Sparkles, Target, X } from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "../api";
import {
  AgentDecisionChart,
  ConfidenceChart,
  FindingsByDomainChart,
  GateOutcomeChart,
  SupplierScoreChart,
} from "../components/charts/AgentCharts";
import { SEVERITY_COLOR, compact } from "../components/charts/chart-kit";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { PillTabs, type PillOption } from "../components/ui/tabs";
import { usePoll } from "../hooks";
import { cn } from "../lib/utils";
import type { Finding } from "../types";

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

/** A finding tagged with the domain whose agent raised it. */
interface TaggedFinding extends Finding {
  domain: string;
}

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
 * and the findings list together. Each chart also ships a table view, so no
 * value is reachable only by hovering.
 */
export function ImpactView() {
  const { data, error } = usePoll(() => api.analysisOverview(), 30_000);

  const [domain, setDomain] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity>("all");
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
          (severity === "all" || finding.severity === severity)
      ),
    [allFindings, domain, severity]
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

  const interpreted = data.analyses.filter((a) => a.source !== "rules").length;
  const criticals = allFindings.filter((f) => f.severity === "critical").length;
  const scored = data.decisions.filter((d) => typeof d.confidence === "number");
  const meanConfidence =
    scored.length > 0
      ? Math.round((scored.reduce((sum, d) => sum + (d.confidence ?? 0), 0) / scored.length) * 100)
      : null;

  const selectedGap =
    data.matches.find((m) => `${m.importer_iso3}-${m.commodity_code}` === gapKey) ??
    data.matches[0] ??
    null;

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

  const filtersActive = domain !== null || severity !== "all";

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

      {/* ── The ranking the logistics agent works from ──────────────────── */}
      {data.matches.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
              Sourcing gap
            </span>
            <select
              value={gapKey ?? `${data.matches[0].importer_iso3}-${data.matches[0].commodity_code}`}
              onChange={(event) => setGapKey(event.target.value)}
              className="min-w-0 max-w-full rounded-md border border-ng-border bg-ng-bg px-2.5 py-1.5 text-ng-sm text-ng-primary focus:outline-none focus-visible:border-ng-accent focus-visible:ring-2 focus-visible:ring-ng-accent"
            >
              {data.matches.map((match) => (
                <option
                  key={`${match.importer_iso3}-${match.commodity_code}`}
                  value={`${match.importer_iso3}-${match.commodity_code}`}
                >
                  {match.importer} · {match.commodity} · {compact(match.external_usd)} external
                </option>
              ))}
            </select>
          </div>
          <SupplierScoreChart match={selectedGap} />
          {selectedGap ? (
            <p className="text-ng-xs leading-relaxed text-ng-secondary">
              <span className="font-semibold text-ng-primary">Not scored:</span>{" "}
              {selectedGap.not_scored.join(" ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <AgentDecisionChart decisions={data.decisions} />
        <GateOutcomeChart gateDecisions={data.gate_decisions} />
      </div>

      {/* ── The findings the charts above are counting ──────────────────── */}
      <div>
        <h2 className="text-ng-lg font-bold tracking-tight text-ng-primary">
          {filtered.length} finding{filtered.length === 1 ? "" : "s"}
          {filtersActive ? " matching the filters" : ""}
        </h2>
        <p className="mt-0.5 text-ng-sm text-ng-secondary">
          Every conclusion behind the charts above, with the figures it rests on.
        </p>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-ng-secondary">
            No finding matches these filters.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((finding, index) => (
            <Card key={`${finding.domain}-${finding.title}-${index}`} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="muted" size="sm">
                  {DOMAIN_LABEL[finding.domain] ?? finding.domain}
                </Badge>
                <h3 className="text-ng-base font-semibold leading-snug text-ng-primary">
                  {finding.title}
                </h3>
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

              <p className="mt-2 max-w-4xl text-ng-sm leading-relaxed text-ng-primary">
                {finding.finding}
              </p>
              {finding.recommendation ? (
                <p className="mt-2 max-w-4xl border-l-2 border-ng-accent pl-3 text-ng-sm leading-relaxed text-ng-secondary">
                  {finding.recommendation}
                </p>
              ) : null}

              {finding.evidence.length > 0 ? (
                <details className="mt-2.5">
                  <summary className="cursor-pointer text-ng-2xs font-semibold uppercase tracking-[.6px] text-ng-secondary hover:text-ng-primary">
                    Evidence ({finding.evidence.length})
                  </summary>
                  <ul className="mt-1.5 space-y-1 rounded-md border border-ng-border bg-ng-bg px-3 py-2">
                    {finding.evidence.map((item, i) => (
                      <li key={i} className="font-mono text-ng-xs leading-snug text-ng-secondary">
                        · {item}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {finding.states.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {finding.states.map((state) => (
                    <Badge key={state} variant="muted" size="sm">
                      {state}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
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
