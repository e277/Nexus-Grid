import { api, UnauthorizedError } from "../api";
import { DataTable } from "../components/DataTable";
import { Panel } from "../components/Panel";
import { StatTile } from "../components/StatTile";
import { StatusPill } from "../components/StatusPill";
import { usePoll } from "../hooks";
import type { AgentActivity } from "../types";

const HEALTH_LABEL: Record<string, string> = {
  healthy: "Healthy",
  strained: "Strained",
  at_risk: "At risk",
};

async function loadOverview() {
  const [overview, shipments, demands, weather] = await Promise.all([
    api.overview(),
    api.shipments(),
    api.demands(),
    api.weatherEvents(),
  ]);
  // Agent activity is government/admin-only: degrade gracefully
  let activities: AgentActivity[] | null = null;
  try {
    activities = await api.agentActivities();
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    activities = null;
  }
  return { overview, shipments, demands, weather, activities };
}

export function OverviewView() {
  const { data, error } = usePoll(loadOverview);

  if (error) {
    return <p className="text-sm text-amber-800">Failed to load: {error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  const { overview, shipments, demands, weather, activities } = data;
  const openDemands = demands.filter((d) => d.status === "open");
  const activeShipments = shipments.filter((s) =>
    ["planned", "in_transit", "delayed"].includes(s.status)
  );

  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile
          label="Supply chain health"
          value={HEALTH_LABEL[overview.health] ?? overview.health}
          hint={overview.explanation}
        />
        <StatTile
          label="Inventory (units)"
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
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Regional food security gaps">
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
                  <span className="font-semibold">{g.gap.toLocaleString()}</span>
                ),
                numeric: true,
              },
            ]}
          />
        </Panel>

        <Panel title="Shipments">
          <DataTable
            rows={shipments}
            rowKey={(s) => s.id}
            empty="No shipments yet."
            columns={[
              {
                label: "Lane",
                render: (s) => `${s.origin_island} → ${s.destination_island}`,
              },
              { label: "Qty", render: (s) => s.quantity.toLocaleString(), numeric: true },
              { label: "Status", render: (s) => <StatusPill value={s.status} /> },
            ]}
          />
        </Panel>

        <Panel title="Open demand">
          <DataTable
            rows={openDemands}
            rowKey={(d) => d.id}
            empty="No open demand."
            columns={[
              { label: "Crop", render: (d) => d.crop_name },
              { label: "Qty", render: (d) => d.quantity.toLocaleString(), numeric: true },
              { label: "Needed by", render: (d) => d.needed_by ?? "—" },
              { label: "Status", render: (d) => <StatusPill value={d.status} /> },
            ]}
          />
        </Panel>

        <Panel title="Weather alerts">
          <DataTable
            rows={weather}
            rowKey={(w) => w.id}
            empty="No active hazards."
            limit={5}
            columns={[
              { label: "Event", render: (w) => w.event_type },
              { label: "Islands", render: (w) => w.affected_islands ?? "region-wide" },
              { label: "Severity", render: (w) => <StatusPill value={w.severity} /> },
            ]}
          />
        </Panel>

        <Panel title="Agent activity">
          {activities === null ? (
            <p className="text-sm text-slate-400">Visible to government and admin roles.</p>
          ) : (
            <DataTable
              rows={activities}
              rowKey={(a) => a.id}
              empty="No agent decisions recorded yet."
              columns={[
                {
                  label: "Agent",
                  render: (a) => (
                    <span className="font-mono text-xs text-slate-600">{a.agent_name}</span>
                  ),
                },
                { label: "Action", render: (a) => a.action },
                {
                  label: "Confidence",
                  render: (a) =>
                    a.confidence != null ? `${Math.round(a.confidence * 100)}%` : "—",
                  numeric: true,
                },
              ]}
            />
          )}
        </Panel>
      </div>
    </>
  );
}
