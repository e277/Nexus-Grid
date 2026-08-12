"use client";

import { Anchor, EyeOff, Route, Ship, Wind } from "lucide-react";
import { useState } from "react";

import { api } from "../api";
import { LaneChart } from "../components/charts/LaneChart";
import { DataTable } from "../components/DataTable";
import { Panel } from "../components/Panel";
import { SourceBar } from "../components/SourceBar";
import { StatTile } from "../components/StatTile";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { ViewSkeleton } from "../components/ui/skeleton";
import { usePoll } from "../hooks";
import { LOGISTICS_SOURCES } from "../source-map";
import type { Lane } from "../types";

const LANE_STATUS: Record<Lane["status"], { label: string; variant: "success" | "warning" | "danger" }> = {
  clear: { label: "Clear", variant: "success" },
  watch: { label: "Watch", variant: "warning" },
  at_risk: { label: "At risk", variant: "danger" },
};

const RISK_VARIANT: Record<string, "success" | "warning" | "danger"> = {
  low: "success",
  medium: "warning",
  high: "danger",
};

function usd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${Math.round(value / 1_000_000)}M`;
  return `$${value.toLocaleString()}`;
}

export function LogisticsView() {
  const { data, error, refresh } = usePoll(() => api.lanes(), 25_000);
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
        Failed to load lanes: {error}
      </p>
    );
  }

  if (!data) return <ViewSkeleton tiles={4} panels={2} />;

  const { lanes, ports, active_storms: storms, unobserved, sources } = data;
  const atRisk = lanes.filter((l) => l.status !== "clear");
  const maxLanes = Math.max(...ports.map((p) => p.lanes), 1);
  const medianTransit = (() => {
    if (lanes.length === 0) return null;
    const hours = lanes.map((l) => l.transit_hours).sort((a, b) => a - b);
    return hours[Math.floor(hours.length / 2)];
  })();

  return (
    <div className="space-y-5">
      <SourceBar
        sources={sources}
        uses={LOGISTICS_SOURCES}
        onRefresh={forceRefresh}
        refreshing={refreshing}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Lanes derived"
          value={lanes.length}
          icon={<Route size={13} />}
          tone="accent"
          hint="One per commodity a regional supplier could ship to an importer buying it externally"
        />
        <StatTile
          label="Ports touched"
          value={ports.length}
          icon={<Anchor size={13} />}
          tone="info"
          hint="Main port of each member state on at least one lane"
        />
        <StatTile
          label="Lanes with weather exposure"
          value={`${atRisk.length} / ${lanes.length}`}
          icon={<Wind size={13} />}
          tone={atRisk.length > 0 ? "warning" : "success"}
          hint={
            atRisk.length > 0
              ? "Elevated climate risk at one or both ends right now"
              : "No elevated risk at either end of any lane"
          }
        />
        <StatTile
          label="Median transit"
          value={medianTransit === null ? "—" : `${medianTransit}h`}
          icon={<Ship size={13} />}
          tone="neutral"
          hint="Great-circle distance at a documented average sea speed, plus port handling"
        />
      </div>

      {storms.length > 0 ? (
        <div className="rounded-[10px] border border-ng-danger-bd bg-ng-danger-bg px-4 py-3">
          <p className="flex items-center gap-2 text-ng-sm font-semibold text-ng-danger-tx">
            <Wind size={14} aria-hidden />
            {storms.length} active storm{storms.length === 1 ? "" : "s"} in the basin
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {storms.map((storm) => (
              <li key={storm.name} className="text-ng-xs text-ng-danger-tx">
                {storm.name} · {storm.classification}
                {storm.intensity_kt !== null ? ` · ${storm.intensity_kt} kt` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Panel
        title="Port exposure"
        subtitle="Each state’s main port, how many lanes run through it, and the live weather risk there"
        noPad
      >
        {ports.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ng-secondary">
            No ports on any lane — there are no substitution opportunities to route.
          </p>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {ports.map((port) => (
              <Card key={port.iso3} className="p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Anchor size={13} className="shrink-0 text-ng-secondary" aria-hidden />
                  <p className="text-ng-sm font-semibold text-ng-primary">{port.name}</p>
                  {port.climate_risk ? (
                    <Badge
                      variant={RISK_VARIANT[port.climate_risk] ?? "muted"}
                      size="sm"
                      className="ml-auto"
                    >
                      {port.climate_risk} risk
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-ng-2xs uppercase tracking-[.5px] text-ng-secondary">
                      Lanes through this port
                    </span>
                    <span className="text-ng-sm font-semibold tabular-nums text-ng-primary">
                      {port.lanes}
                    </span>
                  </div>
                  <Progress
                    value={port.lanes}
                    max={maxLanes}
                    tone={port.climate_risk === "high" ? "danger" : "accent"}
                    label={`${port.name}: ${port.lanes} lanes`}
                    className="mt-1"
                  />
                </div>

                <p className="mt-2.5 text-ng-xs text-ng-secondary">
                  {usd(port.food_imports_usd)} of food imports observed through this state
                </p>
              </Card>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Transit on each lane"
        subtitle="Estimated sailing time between the two main ports, shortest first"
      >
        <LaneChart lanes={lanes} />
      </Panel>

      <Panel
        title="All lanes"
        subtitle="Every supplier–importer pair behind a sourcing gap, with the weather at both ends"
        noPad
      >
        <DataTable<Lane>
          rows={lanes}
          rowKey={(l) => `${l.supplier_iso3}-${l.importer_iso3}-${l.commodity}`}
          pageSize={10}
          searchPlaceholder="Search lane, commodity, state…"
          empty="No lanes derived from the current trade snapshot."
          columns={[
            {
              label: "Lane",
              sortValue: (l) => `${l.supplier} → ${l.importer}`,
              render: (l) => (
                <span className="font-medium">
                  {l.supplier} <span className="text-ng-secondary">→</span> {l.importer}
                </span>
              ),
            },
            { label: "Commodity", sortValue: (l) => l.commodity, render: (l) => l.commodity },
            {
              label: "Distance",
              numeric: true,
              sortValue: (l) => l.distance_km,
              render: (l) =>
                l.distance_km === null ? "—" : `${Math.round(l.distance_km).toLocaleString()} km`,
            },
            {
              label: "Transit",
              numeric: true,
              sortValue: (l) => l.transit_hours,
              render: (l) => `${l.transit_hours}h`,
            },
            {
              label: "Could displace",
              numeric: true,
              sortValue: (l) => l.external_usd,
              render: (l) => usd(l.external_usd),
            },
            {
              label: "Status",
              sortValue: (l) => l.status,
              render: (l) => (
                <Badge variant={LANE_STATUS[l.status].variant} size="sm">
                  {LANE_STATUS[l.status].label}
                </Badge>
              ),
            },
          ]}
        />
      </Panel>

      {/* Stated, not implied: the page would otherwise read as if congestion
          and capacity were simply zero. */}
      <Panel
        title="What this page cannot see"
        subtitle="No CARICOM-wide feed publishes these, so the platform does not estimate them"
      >
        <ul className="space-y-2">
          {unobserved.map((item) => (
            <li key={item} className="flex gap-2 text-ng-sm leading-relaxed text-ng-secondary">
              <EyeOff size={13} className="mt-1 shrink-0 text-ng-disabled" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
