"use client";

import { CloudRain, Droplets, Sprout, Wind } from "lucide-react";
import { useState } from "react";

import { api } from "../api";
import { CapabilityRadar } from "../components/charts/CapabilityRadar";
import { Matrix, MatrixLegend, type MatrixCell } from "../components/charts/Matrix";
import { DataTable } from "../components/DataTable";
import { Panel } from "../components/Panel";
import { SourceBar } from "../components/SourceBar";
import { StatTile } from "../components/StatTile";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { ViewSkeleton } from "../components/ui/skeleton";
import { usePoll } from "../hooks";
import { SOIL_SOURCES } from "../source-map";
import type { StateProfile } from "../types";

const RISK_VARIANT: Record<string, "success" | "warning" | "danger" | "muted"> = {
  low: "success",
  medium: "warning",
  high: "danger",
};

/**
 * Indicators the matrix scores, with the unit each is really measured in.
 *
 * Every cell prints the real value; the shading is an index against the
 * regional maximum, which is the only way five different units can share one
 * grid without one of them dominating the colour.
 */
const INDICATORS = [
  { key: "ph", label: "Soil pH", unit: "", digits: 1 },
  { key: "soc", label: "Org. carbon", unit: " g/kg", digits: 0 },
  { key: "clay", label: "Clay", unit: "%", digits: 0 },
  { key: "arable", label: "Arable land", unit: "%", digits: 1 },
  { key: "window", label: "Rain-fed", unit: " mo", digits: 0 },
] as const;

type IndicatorKey = (typeof INDICATORS)[number]["key"];

function indicatorValue(state: StateProfile, key: IndicatorKey): number | null {
  switch (key) {
    case "ph":
      return state.soil?.ph ?? null;
    case "soc":
      return state.soil?.organic_carbon_g_per_kg ?? null;
    case "clay":
      return state.soil?.clay_pct ?? null;
    case "arable":
      return state.arable_land_pct;
    case "window":
      return state.rain_fed_months.length || null;
  }
}

export function SoilCropView() {
  const { data, error, refresh } = usePoll(() => api.picture(), 20_000);
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
        Failed to load growing conditions: {error}
      </p>
    );
  }

  if (!data) return <ViewSkeleton tiles={4} panels={2} />;

  const { picture, sources } = data;
  const withSoil = picture.states.filter((s) => s.soil?.has_coverage);
  const atRisk = picture.climate.islands_at_risk;
  const storms = picture.climate.active_storms;

  const matrixRows = picture.states
    .filter((s) => INDICATORS.some((i) => indicatorValue(s, i.key) !== null))
    .slice(0, 12)
    .map((s) => s.name);

  const stateByName = new Map(picture.states.map((s) => [s.name, s]));

  const maxima = Object.fromEntries(
    INDICATORS.map((indicator) => [
      indicator.key,
      Math.max(
        ...picture.states.map((s) => indicatorValue(s, indicator.key) ?? 0),
        1
      ),
    ])
  ) as Record<IndicatorKey, number>;

  function cell(rowName: string, columnLabel: string): MatrixCell {
    const state = stateByName.get(rowName);
    const indicator = INDICATORS.find((i) => i.label === columnLabel)!;
    const value = state ? indicatorValue(state, indicator.key) : null;

    if (value === null) {
      return {
        label: "—",
        intensity: null,
        title: `${rowName} · ${indicator.label}: not covered by the source grid`,
      };
    }
    return {
      label: `${value.toFixed(indicator.digits)}${indicator.unit}`,
      intensity: Math.min(1, value / maxima[indicator.key]),
      title: `${rowName} · ${indicator.label}: ${value.toFixed(indicator.digits)}${indicator.unit} (regional max ${maxima[indicator.key].toFixed(indicator.digits)}${indicator.unit})`,
    };
  }

  return (
    <div className="space-y-5">
      <SourceBar
        sources={sources}
        uses={SOIL_SOURCES}
        onRefresh={forceRefresh}
        refreshing={refreshing}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="States with soil coverage"
          value={picture.agronomy.states_with_soil_coverage}
          icon={<Sprout size={13} />}
          tone="accent"
          hint="ISRIC SoilGrids returns a reading at the main growing point"
        />
        <StatTile
          label="States with a planting calendar"
          value={picture.agronomy.states_with_planting_calendar}
          icon={<CloudRain size={13} />}
          tone="info"
          hint="NASA POWER climate normals resolve a rain-fed window"
        />
        <StatTile
          label="Islands at climate risk"
          value={atRisk.length}
          icon={<Wind size={13} />}
          tone={atRisk.length > 0 ? "warning" : "success"}
          hint={
            atRisk.length > 0
              ? atRisk.slice(0, 3).map((i) => i.island).join(", ")
              : "No elevated risk in the current Open-Meteo read"
          }
        />
        <StatTile
          label="Active storms"
          value={storms.length}
          icon={<Droplets size={13} />}
          tone={storms.length > 0 ? "danger" : "success"}
          hint={
            storms.length > 0
              ? storms.map((s) => `${s.name} (${s.classification})`).join(", ")
              : "NOAA NHC reports nothing active"
          }
        />
      </div>

      <Panel
        title="Growing conditions per member state"
        subtitle="Soil under the main growing area, and what the land already yields — shading indexes each column against the regional maximum, and every cell prints its real value"
      >
        <Matrix
          columns={INDICATORS.map((i) => i.label)}
          rows={matrixRows}
          cell={cell}
          legend={<MatrixLegend low="Regional low" high="Regional high" />}
        />
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel
          title="Regional production capability"
          subtitle="Five indicators, each indexed 0–100 against the regional maximum — the three states already trading at the greatest volume"
        >
          <CapabilityRadar states={picture.states} />
        </Panel>

        <Panel
          title="Soil profiles"
          subtitle="What SoilGrids reads at each state’s main growing point, and what it implies"
          noPad
        >
          <div className="max-h-[340px] space-y-3 overflow-y-auto p-4">
            {withSoil.length === 0 ? (
              <p className="text-sm text-ng-secondary">
                No state has soil coverage yet — SoilGrids is fetched a few states per refresh to
                stay under its rate limit.
              </p>
            ) : (
              withSoil.map((state) => {
                const soil = state.soil!;
                return (
                  <Card key={state.iso3} className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-ng-sm font-semibold text-ng-primary">{state.name}</p>
                      {state.climate_risk ? (
                        <Badge variant={RISK_VARIANT[state.climate_risk] ?? "muted"} size="sm">
                          {state.climate_risk} climate risk
                        </Badge>
                      ) : null}
                      {state.rain_fed_months.length > 0 ? (
                        <Badge variant="muted" size="sm" className="ml-auto">
                          {state.rain_fed_months.length} rain-fed months
                        </Badge>
                      ) : null}
                    </div>

                    <div className="mt-2.5 grid grid-cols-3 gap-3">
                      <Meter
                        label="pH"
                        value={soil.ph}
                        display={soil.ph?.toFixed(1) ?? "—"}
                        max={14}
                        // Outside 5.5–7.5 needs intervention before most field
                        // crops will do well, so the meter says so.
                        tone={
                          soil.ph === null
                            ? "accent"
                            : soil.ph < 5.5 || soil.ph > 7.5
                              ? "warning"
                              : "success"
                        }
                      />
                      <Meter
                        label="Org. carbon"
                        value={soil.organic_carbon_g_per_kg}
                        display={
                          soil.organic_carbon_g_per_kg === null
                            ? "—"
                            : `${Math.round(soil.organic_carbon_g_per_kg)} g/kg`
                        }
                        max={60}
                        tone={
                          soil.organic_carbon_g_per_kg !== null &&
                          soil.organic_carbon_g_per_kg < 10
                            ? "warning"
                            : "accent"
                        }
                      />
                      <Meter
                        label="Clay"
                        value={soil.clay_pct}
                        display={soil.clay_pct === null ? "—" : `${Math.round(soil.clay_pct)}%`}
                        max={100}
                        tone="info"
                      />
                    </div>

                    <p className="mt-2.5 text-ng-xs leading-snug text-ng-secondary">
                      {soil.suitability}
                    </p>
                  </Card>
                );
              })
            )}
          </div>
        </Panel>
      </div>

      <Panel
        title="Member states"
        subtitle="Derived from the snapshots above — nothing here is entered by hand"
        noPad
      >
        <DataTable<StateProfile>
          rows={picture.states.filter((s) => s.food_imports_usd > 0 || s.soil?.has_coverage)}
          rowKey={(s) => s.iso3}
          pageSize={10}
          searchPlaceholder="Search member states…"
          columns={[
            {
              label: "State",
              sortValue: (s) => s.name,
              render: (s) => <span className="font-medium">{s.name}</span>,
            },
            {
              label: "Arable land",
              numeric: true,
              sortValue: (s) => s.arable_land_pct,
              render: (s) => (s.arable_land_pct === null ? "—" : `${s.arable_land_pct}%`),
            },
            {
              label: "Agri. land",
              numeric: true,
              sortValue: (s) => s.agricultural_land_pct,
              render: (s) =>
                s.agricultural_land_pct === null ? "—" : `${s.agricultural_land_pct}%`,
            },
            {
              label: "Cereal yield",
              numeric: true,
              sortValue: (s) => s.cereal_yield_kg_ha,
              render: (s) =>
                s.cereal_yield_kg_ha === null
                  ? "—"
                  : `${s.cereal_yield_kg_ha.toLocaleString()} kg/ha`,
            },
            {
              label: "Rain-fed months",
              numeric: true,
              sortValue: (s) => s.rain_fed_months.length,
              render: (s) => s.rain_fed_months.length || "—",
            },
            {
              label: "Climate risk",
              sortValue: (s) => s.climate_risk,
              render: (s) =>
                s.climate_risk ? (
                  <Badge variant={RISK_VARIANT[s.climate_risk] ?? "muted"} size="sm">
                    {s.climate_risk}
                  </Badge>
                ) : (
                  <span className="text-ng-secondary">—</span>
                ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

function Meter({
  label,
  value,
  display,
  max,
  tone,
}: {
  label: string;
  value: number | null;
  display: string;
  max: number;
  tone: "accent" | "success" | "warning" | "info";
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-ng-2xs uppercase tracking-[.5px] text-ng-secondary">{label}</span>
        <span className="text-ng-xs font-semibold tabular-nums text-ng-primary">{display}</span>
      </div>
      <Progress
        value={value ?? 0}
        max={max}
        tone={tone}
        label={`${label}: ${display}`}
        className="mt-1"
      />
    </div>
  );
}
