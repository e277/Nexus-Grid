import { useState } from "react";
import { api } from "../api";
import type { TabId } from "../App";
import { BarChart } from "../components/charts/BarChart";
import { Meter } from "../components/charts/Meter";
import { SegmentedBar } from "../components/charts/SegmentedBar";
import { DataTable } from "../components/DataTable";
import { Panel } from "../components/Panel";
import { StatTile } from "../components/StatTile";
import { StatusPill } from "../components/StatusPill";
import { usePoll } from "../hooks";
import type { AgentActivity } from "../types";
import { WorkflowView } from "./WorkflowView";

// Same semantic tokens StatusPill already maps these statuses to.
const SHIPMENT_STATUS_COLOR: Record<string, string> = {
  planned: "var(--color-muted-text)",
  in_transit: "var(--color-info-text)",
  delayed: "var(--color-warning-text)",
  delivered: "var(--color-success-text)",
  cancelled: "var(--color-text-disabled)",
};

const HEALTH_LABEL: Record<string, string> = {
  healthy: "Healthy",
  strained: "Strained",
  at_risk: "At risk",
};

const HEALTH_DELTA: Record<string, { label: string; kind: "up" | "down" | "warn" | "neutral" }> = {
  healthy: { label: "Operating normally", kind: "up" },
  strained: { label: "Re-plan underway", kind: "warn" },
  at_risk: { label: "Immediate action needed", kind: "down" },
};

async function loadOverview() {
  const [overview, shipments, demands, weather, farmers, crops, buyers, ports] = await Promise.all([
    api.overview(),
    api.shipments(),
    api.demands(),
    api.weatherEvents(),
    api.farmers(),
    api.crops(),
    api.buyers(),
    api.ports(),
  ]);

  // Soft-fails so one unavailable panel never blanks the whole dashboard.
  const activities: AgentActivity[] | null = await api.agentActivities().catch(() => null);

  return { overview, shipments, demands, weather, farmers, crops, buyers, ports, activities };
}

interface OverviewViewProps {
  onNavigate: (tab: TabId) => void;
}

export function OverviewView({ onNavigate }: OverviewViewProps) {
  const { data, error } = usePoll(loadOverview);
  const [heroCollapsed, setHeroCollapsed] = useState(false);

  if (error) {
    return (
      <p className="rounded-md border border-ng-warning-bd bg-ng-warning-bg px-4 py-3 text-sm text-ng-warning-tx">
        Failed to load: {error}
      </p>
    );
  }

  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-[10px] border border-ng-border bg-ng-muted" />
        ))}
      </div>
    );
  }

  const { overview, shipments, demands, weather, farmers, crops, buyers, ports, activities } = data;
  const openDemands = demands.filter((d) => d.status === "open");
  const activeShipments = shipments.filter((s) => ["planned", "in_transit", "delayed"].includes(s.status));

  const workflowSteps: {
    key: string;
    title: string;
    description: string;
    detail: string;
    location: string;
    state: "done" | "pending";
    targetTab: TabId;
  }[] = [
    {
      key: "supply",
      title: "1. Register farm supply",
      description: "Start by capturing farmers and the crops they can offer.",
      detail: `${farmers.length} farmer record(s) and ${crops.length} crop lot(s) are already available.`,
      location: "Farm view",
      state: farmers.length > 0 ? "done" : "pending",
      targetTab: "farm",
    },
    {
      key: "demand",
      title: "2. Add demand signals",
      description: "Create buyer demand so the system knows what needs to move.",
      detail: `${buyers.length} buyer(s) are on file and ${openDemands.length} demand request(s) are still open.`,
      location: "Market view",
      state: buyers.length > 0 && demands.length > 0 ? "done" : "pending",
      targetTab: "market",
    },
    {
      key: "shipment",
      title: "3. Book the shipment",
      description: "Pair inventory with demand and reserve a route before the window closes.",
      detail: `${activeShipments.length} shipment(s) are currently active across ${ports.length} port record(s).`,
      location: "Logistics view",
      state: activeShipments.length > 0 || shipments.length > 0 ? "done" : "pending",
      targetTab: "logistics",
    },
    {
      key: "hazard",
      title: "4. Flag hazards",
      description: "Record weather disruptions so the workflow has real risk signal to reason over.",
      detail: `${weather.length} hazard alert(s) are in the feed.`,
      location: "Government view",
      state: weather.length > 0 ? "done" : "pending",
      targetTab: "government",
    },
  ];

  const completedSteps = workflowSteps.filter((step) => step.state === "done").length;
  const progressPercent = Math.round((completedSteps / workflowSteps.length) * 100);

  return (
    <>
      <section className="mb-6 rounded-[16px] border border-ng-border bg-gradient-to-br from-ng-surface to-ng-bg p-6 shadow-ng-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-ng-xs font-semibold uppercase tracking-[.7px] text-ng-accent">Workflow walkthrough</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ng-primary">
              Follow this order so the system can recommend the right action.
            </h1>
            <p className="mt-2 text-sm leading-6 text-ng-secondary">
              Enter the data in sequence: farm supply, demand, logistics, and hazards. Each step grounds the next recommendation and keeps the operator checklist clear.
            </p>
          </div>
          <div className="min-w-[220px] rounded-[10px] border border-ng-border bg-ng-surface px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-ng-xs font-semibold uppercase tracking-[.6px] text-ng-secondary">Current progress</p>
              {progressPercent === 100 ? (
                <button
                  type="button"
                  onClick={() => setHeroCollapsed((v) => !v)}
                  className="text-ng-xs font-medium text-ng-accent hover:underline"
                >
                  {heroCollapsed ? "Show steps" : "Hide steps"}
                </button>
              ) : null}
            </div>
            <div className="mt-2.5">
              <Meter value={progressPercent} max={100} label="Ready" />
            </div>
          </div>
        </div>
      </section>

      <div className={`mb-6 ${heroCollapsed ? "hidden" : ""}`}>
        <Panel title="Autonomous workflow" subtitle="Data readiness, then run it end to end" noPad>
          <div className="flex flex-wrap items-center gap-2 border-b border-ng-border p-4">
            {workflowSteps.map((step) => {
              const isDone = step.state === "done";
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => onNavigate(step.targetTab)}
                  title={step.description}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isDone
                      ? "border-ng-success-bd bg-ng-success-bg text-ng-success-tx"
                      : "border-ng-border bg-ng-surface text-ng-secondary hover:bg-ng-bg"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      isDone ? "bg-ng-success text-white" : "bg-ng-muted text-ng-muted-tx"
                    }`}
                  >
                    {isDone ? "✓" : step.key === "supply" ? "1" : step.key === "demand" ? "2" : step.key === "shipment" ? "3" : "4"}
                  </span>
                  {step.title.replace(/^\d+\.\s*/, "")}
                </button>
              );
            })}
          </div>

          <div className="p-4">
            <WorkflowView />
          </div>
        </Panel>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile
          label="Supply chain health"
          value={HEALTH_LABEL[overview.health] ?? overview.health}
          hint={overview.explanation}
          delta={HEALTH_DELTA[overview.health]}
        />
        <StatTile
          label="Inventory"
          value={overview.counts.total_inventory.toLocaleString()}
          hint={`${overview.counts.crop_lots} crop lot(s) · ${overview.counts.farmers} farmer(s)`}
        />
        <StatTile
          label="Open demand"
          value={overview.counts.open_demands}
          hint={`${overview.counts.buyers} buyer(s)`}
        />
        <StatTile
          label="Active shipments"
          value={activeShipments.length}
          hint={`${overview.active_hazards} hazard(s) · ${overview.ports_disrupted} port(s) disrupted`}
          delta={
            overview.ports_disrupted > 0
              ? { label: `${overview.ports_disrupted} port(s) disrupted`, kind: "warn" }
              : undefined
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Regional food security gaps" subtitle="Open demand vs. available supply by crop">
          {overview.food_security_gaps.length > 0 ? (
            <div className="mb-4">
              <BarChart
                categories={overview.food_security_gaps.map((g) => ({
                  key: g.crop_name,
                  label: g.crop_name,
                  values: { open_demand: g.open_demand, available_supply: g.available_supply },
                }))}
                series={[
                  { key: "open_demand", label: "Open demand", colorVar: "var(--chart-2)" },
                  { key: "available_supply", label: "Available supply", colorVar: "var(--chart-1)" },
                ]}
              />
            </div>
          ) : null}
          <DataTable
            rows={overview.food_security_gaps}
            rowKey={(g) => g.crop_name}
            empty="No unmet demand — supply covers all open requests."
            columns={[
              { label: "Crop", render: (g) => g.crop_name },
              { label: "Open demand", render: (g) => g.open_demand.toLocaleString(), numeric: true },
              { label: "Supply", render: (g) => g.available_supply.toLocaleString(), numeric: true },
              {
                label: "Gap",
                render: (g) => (
                  <span className={g.gap > 0 ? "font-semibold text-ng-danger-tx" : "font-semibold text-ng-success-tx"}>
                    {g.gap > 0 ? "−" : "+"}
                    {Math.abs(g.gap).toLocaleString()}
                  </span>
                ),
                numeric: true,
              },
            ]}
          />
        </Panel>

        <Panel title="Live shipments" subtitle="In-transit and planned routes">
          <div className="mb-4">
            <SegmentedBar
              segments={Object.entries(overview.counts.shipments).map(([status, count]) => ({
                key: status,
                label: status.replace("_", " "),
                value: count,
                colorVar: SHIPMENT_STATUS_COLOR[status] ?? "var(--color-muted-text)",
              }))}
            />
          </div>
          <DataTable
            rows={shipments}
            rowKey={(s) => s.id}
            empty="No shipments yet."
            columns={[
              {
                label: "Lane",
                render: (s) => (
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium">{s.origin_island}</span>
                    <span className="text-xs text-ng-secondary">→</span>
                    <span className="font-medium">{s.destination_island}</span>
                  </span>
                ),
              },
              { label: "Units", render: (s) => s.quantity.toLocaleString(), numeric: true },
              { label: "Status", render: (s) => <StatusPill value={s.status} /> },
            ]}
          />
        </Panel>

        <Panel title="Open demand" subtitle="Unmet buyer requests awaiting matching" noPad>
          <DataTable
            rows={openDemands}
            rowKey={(d) => d.id}
            empty="No open demand."
            columns={[
              { label: "Crop", render: (d) => d.crop_name },
              { label: "Units", render: (d) => d.quantity.toLocaleString(), numeric: true },
              { label: "Needed by", render: (d) => d.needed_by ?? "—" },
              { label: "Status", render: (d) => <StatusPill value={d.status} /> },
            ]}
          />
        </Panel>

        <Panel title="Weather alerts" subtitle="Hazards and disruption feed" noPad>
          <DataTable
            rows={weather}
            rowKey={(w) => w.id}
            empty="No active hazards."
            limit={5}
            columns={[
              { label: "Event", render: (w) => <span className="font-medium">{w.event_type}</span> },
              { label: "Islands", render: (w) => <span className="text-xs text-ng-secondary">{w.affected_islands ?? "region-wide"}</span> },
              { label: "Severity", render: (w) => <StatusPill value={w.severity} /> },
            ]}
          />
        </Panel>

        <div className="lg:col-span-2">
          <Panel title="Agent activity" subtitle="Autonomous decisions this orchestration cycle" noPad>
            {activities === null ? (
              <p className="px-5 py-4 text-sm text-ng-secondary">Agent activity is unavailable.</p>
            ) : (
              <DataTable
                rows={activities}
                rowKey={(a) => a.id}
                empty="No agent decisions recorded yet."
                columns={[
                  {
                    label: "Agent",
                    render: (a) => (
                      <span className="rounded bg-ng-accent-lit px-1.5 py-0.5 font-mono text-[11px] text-ng-accent">
                        {a.agent_name}
                      </span>
                    ),
                  },
                  { label: "Action", render: (a) => a.action },
                  {
                    label: "Confidence",
                    render: (a) => (a.confidence != null ? `${Math.round(a.confidence * 100)}%` : "—"),
                    numeric: true,
                  },
                ]}
              />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
