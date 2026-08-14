"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { api } from "../api";
import { ConfidenceChart } from "../components/charts/AgentCharts";
import { PlantingCoverageChart } from "../components/charts/PlantingCoverageChart";
import {
  FindingsBoard,
  FindingsMatrix,
  type TaggedFinding,
} from "../components/charts/FindingsBoard";
import { LiveIndicator } from "../components/LiveIndicator";
import { SourceBar } from "../components/SourceBar";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { usePoll } from "../hooks";
import { sourcesForDomain } from "../source-map";
import type { AnalysisDomain, FindingSeverity } from "../types";

/**
 * One agent's reading of one domain.
 *
 * Each of these is a specialist's own conclusions — what it found in the
 * region's trade, soil, planting calendars or freight, at what severity and
 * how sure it was. Nothing here is a publisher's series replotted: the figures
 * behind a finding are in that finding's evidence, beside the conclusion they
 * support.
 *
 * Unlike the dashboard, this does not wait for a sweep. The dashboard holds
 * its findings back because they are the output of a run you are watching
 * start; this page *is* the agent's standing reading, and a reader who
 * navigated here specifically should not be told to go and run something
 * somewhere else first.
 */
export function DomainView({
  domain,
  title,
}: {
  domain: AnalysisDomain;
  title: string;
}) {
  const { data, error, updatedAt, refreshing, intervalMs } = usePoll(
    () => api.analysis(domain),
    30_000,
    [domain]
  );

  const [cell, setCell] = useState<{ severity: FindingSeverity; confidence: string } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  if (error) {
    return (
      <p className="rounded-md border border-ng-warning-bd bg-ng-warning-bg px-4 py-3 text-sm text-ng-warning-tx">
        Failed to load this reading: {error}
      </p>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const { analysis } = data;
  const findings: TaggedFinding[] = analysis.findings.map((finding) => ({
    ...finding,
    domain: analysis.domain,
  }));

  const filtered =
    cell === null
      ? findings
      : findings.filter((f) => f.severity === cell.severity && f.confidence === cell.confidence);

  const byModel = analysis.source !== "rules";

  return (
    <div className="space-y-4">
      {/* The agent's own summary, in its own words, before any chart of it. */}
      <Card className="border-ng-ai-bd/70 bg-gradient-to-br from-ng-ai-bg to-ng-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles size={14} className="shrink-0 text-ng-ai-tx" aria-hidden />
          <h2 className="text-ng-base font-semibold text-ng-primary">What the {title} agent concluded</h2>
          {/* Which produced this matters: a rule-derived reading is a fallback,
              not a model's judgement, and saying so is the difference between
              reporting and overclaiming. */}
          <Badge variant={byModel ? "ai" : "muted"} size="sm">
            {byModel ? analysis.source : "rule-derived fallback"}
          </Badge>
          <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-ng-2xs text-ng-secondary">
              {findings.length} finding{findings.length === 1 ? "" : "s"}
            </span>
            <LiveIndicator
              updatedAt={updatedAt}
              refreshing={refreshing}
              intervalMs={intervalMs}
            />
          </span>
        </div>
        <p className="mt-2 max-w-4xl text-ng-base leading-relaxed text-ng-primary">
          {analysis.summary}
        </p>
        {analysis.note ? (
          <p className="mt-2 max-w-4xl text-ng-sm leading-relaxed text-ng-secondary">
            {analysis.note}
          </p>
        ) : null}
      </Card>

      {/* The planting agent reasons over the region's calendar, so the
          calendar itself belongs on its page — and it is the one view here
          that looks forward rather than reporting the present. */}
      {domain === "planting" ? <PlantingCoverageChart /> : null}

      {findings.length === 0 ? (
        <Card className="p-6">
          <p className="text-ng-sm text-ng-secondary">
            This agent returned no findings for the current picture.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <FindingsMatrix findings={findings} onSelect={setCell} selected={cell} />
            <ConfidenceChart findings={filtered} />
          </div>

          <div>
            <h3 className="text-ng-lg font-bold tracking-tight text-ng-primary">
              {filtered.length} finding{filtered.length === 1 ? "" : "s"}
              {cell ? " in the selected cell" : ""}
            </h3>
            <p className="mt-0.5 text-ng-sm text-ng-secondary">
              Each row leads with the figure the agent attached to it. Select one for the reasoning
              and the evidence behind it.
            </p>
          </div>

          <FindingsBoard findings={filtered} selectedIndex={selected} onSelect={setSelected} />
        </>
      )}

      {/* Where this agent's inputs came from, linked out to each publisher.
          A conclusion a reader cannot trace is a conclusion they have to take
          on trust, and these are public datasets — the least this page can do
          is say which, and point at them. */}
      <SourceBar sources={data.sources} uses={sourcesForDomain(domain)} />
    </div>
  );
}
