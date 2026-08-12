"use client";

import {
  ArrowDown,
  ArrowUp,
  Boxes,
  Brain,
  CalendarRange,
  Globe,
  Route,
  Target,
} from "lucide-react";
import { useState } from "react";

import { api } from "../api";
import { usd } from "../components/charts/chart-kit";
import {
  AgentChart,
  ConfidenceChart,
  OutcomePie,
  type AgentStat,
  type Slice,
} from "../components/charts/DecisionCharts";
import { SourcingChart } from "../components/charts/SourcingChart";
import { DataTable } from "../components/DataTable";
import { Panel } from "../components/Panel";
import { SourceBar } from "../components/SourceBar";
import { StatTile } from "../components/StatTile";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { ViewSkeleton } from "../components/ui/skeleton";
import { usePoll } from "../hooks";
import { cn } from "../lib/utils";
import { IMPACT_SOURCES } from "../source-map";
import type { AgentActivity, AuditLog, GateDecision } from "../types";

/** Gate outcomes wear status tokens: these mean good/bad, they are not series. */
const GATE_SLICES: { decision: GateDecision; name: string; color: string }[] = [
  { decision: "approved", name: "Approved", color: "var(--color-success)" },
  { decision: "modified", name: "Modified", color: "var(--color-info)" },
  { decision: "escalated", name: "Escalated", color: "var(--color-warning)" },
  { decision: "rejected", name: "Rejected", color: "var(--color-danger)" },
];

const GATE_VARIANT: Record<GateDecision, "success" | "info" | "warning" | "danger"> = {
  approved: "success",
  modified: "info",
  escalated: "warning",
  rejected: "danger",
};

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

async function load() {
  const [picture, activities, audits] = await Promise.all([
    api.picture(),
    api.agentActivities({ limit: 200 }).catch(() => [] as AgentActivity[]),
    api.auditLogs({ limit: 200 }).catch(() => [] as AuditLog[]),
  ]);
  return { picture, activities, audits };
}

export function ImpactView() {
  const { data, error, refresh } = usePoll(load, 20_000);
  const [refreshing, setRefreshing] = useState(false);

  async function forceRefresh() {
    setRefreshing(true);
    try {
      await api.refreshSources();
      refresh();
    } finally {
      setRefreshing(false);
    }
  }

  if (error) {
    return (
      <p className="rounded-md border border-ng-warning-bd bg-ng-warning-bg px-4 py-3 text-sm text-ng-warning-tx">
        Failed to load outcomes: {error}
      </p>
    );
  }

  if (!data) return <ViewSkeleton tiles={4} panels={2} />;

  const { picture, sources } = data.picture;
  const totals = picture.totals;
  const gaps = picture.substitution_opportunities;
  const alignment = picture.planting_alignment;

  const addressable = gaps.reduce((sum, g) => sum + g.external_usd, 0);
  const lanePairs = new Set(
    gaps.flatMap((g) => g.regional_suppliers.map((s) => `${s}->${g.importer}`))
  ).size;
  const alignableMonths = new Set(alignment.flatMap((a) => a.complementary_months)).size;

  // "After" is the arithmetic consequence of every observed substitution
  // opportunity being met — a ceiling on what coordination is worth against
  // this snapshot, not a forecast and not a claim about what will happen.
  const afterIntra = totals.intra_caricom_usd + addressable;
  const afterSharePct =
    totals.food_imports_usd > 0
      ? Math.round((afterIntra / totals.food_imports_usd) * 1000) / 10
      : null;
  const beforeSharePct = totals.intra_caricom_share_pct;

  // ── Decisions ──────────────────────────────────────────────────────────
  const activities = data.activities;
  const scored = activities.filter(
    (a): a is AgentActivity & { confidence: number } => typeof a.confidence === "number"
  );
  const meanConfidence =
    scored.length > 0 ? scored.reduce((sum, a) => sum + a.confidence, 0) / scored.length : null;

  const agentStats: AgentStat[] = Object.entries(
    activities.reduce<Record<string, AgentActivity[]>>((acc, activity) => {
      (acc[activity.agent_name] ??= []).push(activity);
      return acc;
    }, {})
  )
    .map(([agent, rows]) => {
      const withScore = rows.filter((r) => typeof r.confidence === "number");
      return {
        agent,
        decisions: rows.length,
        meanConfidence:
          withScore.length > 0
            ? withScore.reduce((sum, r) => sum + (r.confidence ?? 0), 0) / withScore.length
            : null,
      };
    })
    .sort((a, b) => b.decisions - a.decisions);

  const gateLogs = data.audits.filter((log) => log.action.startsWith("workflow.gate_"));
  const gateCount = (decision: GateDecision) =>
    gateLogs.filter((log) => log.action === `workflow.gate_${decision}`).length;

  const slices: Slice[] = GATE_SLICES.map((slice) => ({
    name: slice.name,
    value: gateCount(slice.decision),
    color: slice.color,
  }));
  const gateTotal = slices.reduce((sum, s) => sum + s.value, 0);
  const approvalRate =
    gateTotal > 0
      ? Math.round(((gateCount("approved") + gateCount("modified")) / gateTotal) * 100)
      : null;

  return (
    <div className="space-y-5">
      <SourceBar
        sources={sources}
        uses={IMPACT_SOURCES}
        onRefresh={forceRefresh}
        refreshing={refreshing}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Food imports observed"
          value={usd(totals.food_imports_usd)}
          icon={<Globe size={13} />}
          tone="info"
          hint={`${totals.states_covered} states · ${totals.trade_year ?? "—"}`}
        />
        <StatTile
          label="Regionally sourced today"
          value={`${beforeSharePct ?? "—"}%`}
          icon={<Boxes size={13} />}
          tone={(beforeSharePct ?? 0) < 20 ? "warning" : "success"}
          hint={usd(totals.intra_caricom_usd)}
        />
        <StatTile
          label="Addressable by substitution"
          value={usd(addressable)}
          icon={<Target size={13} />}
          tone="accent"
          hint={`${gaps.length} commodity–importer pairs`}
        />
        <StatTile
          label="Coordination lanes"
          value={lanePairs}
          icon={<Route size={13} />}
          tone="info"
          hint="Distinct supplier→importer routes behind those pairs"
        />
        <StatTile
          label="Planting months alignable"
          value={alignableMonths}
          icon={<CalendarRange size={13} />}
          tone="success"
          hint={`Across ${alignment.length} staggerable pairs`}
        />
        <StatTile
          label="Agent decisions recorded"
          value={activities.length}
          icon={<Brain size={13} />}
          tone="ai"
          hint={
            meanConfidence === null
              ? "No confidence scores yet"
              : `Mean confidence ${Math.round(meanConfidence * 100)}%`
          }
        />
      </div>

      <Panel
        title="Where each state buys its food"
        subtitle="Observed food trade flows, split by whether the supplier sits inside CARICOM"
      >
        <SourcingChart states={picture.states} />
      </Panel>

      {/* ── Before → after ─────────────────────────────────────────────── */}
      <Panel
        title="Today, against the ceiling"
        subtitle="What the region sources regionally now, and what it would source regionally if every observed substitution opportunity were met. The right-hand column is arithmetic on this snapshot — a ceiling, not a forecast"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Comparison
            label="Sourced within CARICOM"
            before={beforeSharePct === null ? "—" : `${beforeSharePct}%`}
            after={afterSharePct === null ? "—" : `${afterSharePct}%`}
            change={
              beforeSharePct !== null && afterSharePct !== null
                ? { direction: "up", label: `+${Math.round((afterSharePct - beforeSharePct) * 10) / 10}pts` }
                : null
            }
          />
          <Comparison
            label="Bought outside the region"
            before={usd(totals.food_imports_usd - totals.intra_caricom_usd)}
            after={usd(Math.max(0, totals.food_imports_usd - afterIntra))}
            change={{ direction: "down", label: `−${usd(addressable)}` }}
          />
          <Comparison
            label="Regional trade value"
            before={usd(totals.intra_caricom_usd)}
            after={usd(afterIntra)}
            change={{ direction: "up", label: `+${usd(addressable)}` }}
          />
        </div>
      </Panel>

      {/* ── Decisions ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-ng-lg font-bold tracking-tight text-ng-primary">
          AI decision outcomes
        </h2>
        {/* Not attributed in the source panel above, and deliberately so:
            these are the only two tables the platform owns. Everything else on
            this page traces to a publisher; this half traces to itself. */}
        <p className="mt-0.5 max-w-3xl text-ng-sm text-ng-secondary">
          Every autonomous decision the agents recorded, and every answer a human gave at the
          approval gate. Unlike the figures above, these come from the platform&rsquo;s own two
          tables — agent activity and the audit trail — not from any publisher.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Total decisions" value={activities.length} tone="ai" />
        <StatTile
          label="Approval rate"
          value={approvalRate === null ? "—" : `${approvalRate}%`}
          tone={approvalRate === null ? "neutral" : approvalRate >= 60 ? "success" : "warning"}
          hint={gateTotal > 0 ? `${gateTotal} gate decisions` : "No gate decisions yet"}
        />
        <StatTile
          label="Mean confidence"
          value={meanConfidence === null ? "—" : `${Math.round(meanConfidence * 100)}%`}
          tone="neutral"
          hint={`${scored.length} scored`}
        />
        <StatTile label="Rejected" value={gateCount("rejected")} tone="danger" />
        <StatTile label="Modified" value={gateCount("modified")} tone="info" />
        <StatTile label="Escalated" value={gateCount("escalated")} tone="warning" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel
          title="Gate decisions"
          subtitle="How humans answered when a run paused for approval"
        >
          <OutcomePie slices={slices} />
        </Panel>
        <Panel
          title="Confidence distribution"
          subtitle="How sure the agents were, across every scored decision"
        >
          <ConfidenceChart activities={activities} />
        </Panel>
      </div>

      <Panel
        title="Decisions by agent"
        subtitle="Which specialist did the deciding, and how confident it was on average"
      >
        <AgentChart stats={agentStats} />
      </Panel>

      <Panel
        title="Recent agent decisions"
        subtitle="Every autonomous decision, its confidence, and when it happened"
        noPad
      >
        <DataTable<AgentActivity>
          rows={activities.slice().reverse()}
          rowKey={(a) => a.id}
          pageSize={10}
          searchPlaceholder="Search agent or action…"
          empty="No agent decisions recorded yet — the scan runs on an interval."
          columns={[
            {
              label: "Agent",
              sortValue: (a) => a.agent_name,
              render: (a) => (
                <span className="font-mono text-ng-xs text-ng-accent">{a.agent_name}</span>
              ),
            },
            { label: "Action", sortValue: (a) => a.action, render: (a) => a.action },
            {
              label: "Confidence",
              numeric: true,
              sortValue: (a) => a.confidence ?? null,
              render: (a) =>
                a.confidence === null || a.confidence === undefined ? (
                  <span className="text-ng-secondary">—</span>
                ) : (
                  <span
                    className={cn(
                      "font-medium",
                      a.confidence >= 0.8
                        ? "text-ng-success-tx"
                        : a.confidence >= 0.5
                          ? "text-ng-warning-tx"
                          : "text-ng-secondary"
                    )}
                  >
                    {a.confidence.toFixed(2)}
                  </span>
                ),
            },
            {
              label: "When",
              sortValue: (a) => a.created_at ?? null,
              render: (a) => <span className="text-ng-secondary">{timeAgo(a.created_at)}</span>,
            },
          ]}
        />
      </Panel>

      <Panel
        title="Audit trail"
        subtitle="State changes, attributed to the integrating system via the X-Actor header"
        noPad
      >
        <DataTable<AuditLog>
          rows={data.audits.slice().reverse()}
          rowKey={(a) => a.id}
          pageSize={10}
          searchPlaceholder="Search actor or action…"
          empty="No state changes recorded yet."
          columns={[
            {
              label: "Actor",
              sortValue: (a) => a.actor,
              render: (a) => <span className="font-mono text-ng-xs">{a.actor}</span>,
            },
            {
              label: "Action",
              sortValue: (a) => a.action,
              render: (a) => {
                const gate = GATE_SLICES.find(
                  (s) => a.action === `workflow.gate_${s.decision}`
                );
                return gate ? (
                  <Badge variant={GATE_VARIANT[gate.decision]} size="sm">
                    Gate · {gate.name}
                  </Badge>
                ) : (
                  a.action
                );
              },
            },
            {
              label: "Detail",
              sortValue: (a) => a.detail ?? null,
              render: (a) => (
                <span className="text-ng-secondary">{a.detail || "—"}</span>
              ),
            },
            {
              label: "When",
              sortValue: (a) => a.created_at ?? null,
              render: (a) => <span className="text-ng-secondary">{timeAgo(a.created_at)}</span>,
            },
          ]}
        />
      </Panel>
    </div>
  );
}

function Comparison({
  label,
  before,
  after,
  change,
}: {
  label: string;
  before: string;
  after: string;
  change: { direction: "up" | "down"; label: string } | null;
}) {
  const Arrow = change?.direction === "down" ? ArrowDown : ArrowUp;
  return (
    <Card className="p-4">
      <p className="text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-ng-lg font-semibold text-ng-secondary line-through decoration-ng-border">
          {before}
        </span>
        <span className="text-ng-secondary" aria-hidden>
          →
        </span>
        <span className="text-ng-2xl font-bold tracking-tight text-ng-primary">{after}</span>
      </div>
      {change ? (
        <Badge variant="success" className="mt-2">
          <Arrow size={11} aria-hidden />
          {change.label}
        </Badge>
      ) : null}
    </Card>
  );
}
