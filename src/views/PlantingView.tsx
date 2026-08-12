"use client";

import { CalendarRange, Handshake, LayoutGrid, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { api } from "../api";
import { CoverageChart, type CoveragePoint } from "../components/charts/CoverageChart";
import { Panel } from "../components/Panel";
import { SourceBar } from "../components/SourceBar";
import { StatTile } from "../components/StatTile";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { ViewSkeleton } from "../components/ui/skeleton";
import { usePoll } from "../hooks";
import { cn } from "../lib/utils";
import { PLANTING_SOURCES } from "../source-map";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SHORT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function usd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${Math.round(value / 1_000_000)}M`;
  return `$${value.toLocaleString()}`;
}

export function PlantingView() {
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
        Failed to load planting calendars: {error}
      </p>
    );
  }

  if (!data) return <ViewSkeleton tiles={4} panels={2} />;

  const { picture, sources } = data;
  const withCalendar = picture.states.filter((s) => s.rain_fed_months.length > 0);
  const alignment = picture.planting_alignment;

  const coverage: CoveragePoint[] = MONTHS.map((month, i) => {
    const names = withCalendar
      .filter((s) => s.rain_fed_months.includes(month))
      .map((s) => s.name);
    return { month: SHORT[i], states: names.length, names };
  });

  const thinnest = coverage.reduce((a, b) => (b.states < a.states ? b : a), coverage[0]);
  const thinnestMonths = coverage
    .filter((c) => c.states === thinnest?.states)
    .map((c) => MONTHS[SHORT.indexOf(c.month)]);
  const addressable = alignment.reduce((sum, a) => sum + a.external_usd, 0);

  return (
    <div className="space-y-5">
      <SourceBar
        sources={sources}
        uses={PLANTING_SOURCES}
        onRefresh={forceRefresh}
        refreshing={refreshing}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="States with a calendar"
          value={withCalendar.length}
          icon={<CalendarRange size={13} />}
          tone="accent"
          hint="NASA POWER climate normals resolve a rain-fed window"
        />
        <StatTile
          label="Staggering opportunities"
          value={alignment.length}
          icon={<Handshake size={13} />}
          tone="info"
          hint="Supplier–importer pairs whose rain-fed windows do not overlap"
        />
        <StatTile
          label="Thinnest month coverage"
          value={thinnest ? `${thinnest.states} state${thinnest.states === 1 ? "" : "s"}` : "—"}
          icon={<TriangleAlert size={13} />}
          tone={thinnest && thinnest.states <= 1 ? "warning" : "neutral"}
          hint={
            thinnestMonths.length > 0
              ? `${thinnestMonths.slice(0, 3).join(", ")}${thinnestMonths.length > 3 ? "…" : ""} — the months a shared calendar would fill`
              : "No calendars loaded yet"
          }
        />
        <StatTile
          label="Value behind these pairs"
          value={usd(addressable)}
          icon={<LayoutGrid size={13} />}
          tone="success"
          hint="External sourcing on the commodities these states could stagger"
        />
      </div>

      <Panel
        title="Regional rain-fed coverage by month"
        subtitle="How many member states can start a season on rainfall alone in each month — the dips are where a coordinated calendar has something to add"
      >
        <CoverageChart points={coverage} />
      </Panel>

      <Panel
        title="Planting windows across the region"
        subtitle="One row per member state. A filled cell is a month that state can plant rain-fed; two states whose rows differ can stagger rather than compete"
        noPad
      >
        <div className="overflow-x-auto p-4">
          {withCalendar.length === 0 ? (
            <p className="text-sm text-ng-secondary">
              No planting calendars available yet — NASA POWER returned no coverage.
            </p>
          ) : (
            <table className="w-full min-w-[520px] border-separate border-spacing-[2px]">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
                    State
                  </th>
                  {SHORT.map((letter, i) => (
                    <th
                      key={MONTHS[i]}
                      scope="col"
                      className="px-1 py-1 text-center text-ng-2xs font-bold text-ng-secondary"
                      title={MONTHS[i]}
                    >
                      {letter}
                    </th>
                  ))}
                  <th className="px-2 py-1 text-right text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
                    Months
                  </th>
                </tr>
              </thead>
              <tbody>
                {withCalendar.map((state) => (
                  <tr key={state.iso3}>
                    <th
                      scope="row"
                      className="whitespace-nowrap px-2 py-1 text-left text-ng-xs font-medium text-ng-primary"
                    >
                      {state.name}
                    </th>
                    {MONTHS.map((month) => {
                      const open = state.rain_fed_months.includes(month);
                      return (
                        <td
                          key={month}
                          title={`${state.name} · ${month}: ${open ? "rain-fed planting window" : "not rain-fed"}`}
                          className={cn(
                            "h-7 rounded text-center text-ng-2xs font-bold",
                            open
                              ? "bg-ng-accent text-ng-accent-fg"
                              : "border border-ng-border bg-ng-bg text-ng-disabled"
                          )}
                        >
                          {/* The glyph, not the fill, is what survives greyscale
                              and colour-vision deficiency. */}
                          {open ? "●" : "·"}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-right text-ng-xs font-semibold tabular-nums text-ng-secondary">
                      {state.rain_fed_months.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>

      <Panel
        title="Coordination opportunities"
        subtitle="Where a supplier can plant in months the importer cannot, so the pair widens regional coverage instead of doubling up"
        noPad
      >
        {alignment.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ng-secondary">
            No complementary windows found — either the calendars overlap, or not enough states have
            one yet.
          </p>
        ) : (
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {alignment.map((pair) => {
              // Urgency follows the money at stake, not a hand-set flag.
              const tone =
                pair.external_usd >= 100_000_000
                  ? "danger"
                  : pair.external_usd >= 25_000_000
                    ? "warning"
                    : "info";
              const border = {
                danger: "border-ng-danger-bd",
                warning: "border-ng-warning-bd",
                info: "border-ng-info-bd",
              }[tone];

              return (
                <Card
                  key={`${pair.importer_iso3}-${pair.supplier_iso3}-${pair.commodity}`}
                  className={cn("p-3.5", border)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={tone}>{pair.commodity}</Badge>
                    <span className="text-ng-sm font-semibold text-ng-primary">
                      {pair.supplier} → {pair.importer}
                    </span>
                    <span className="ml-auto text-ng-xs font-semibold tabular-nums text-ng-secondary">
                      {usd(pair.external_usd)}
                    </span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {pair.complementary_months.map((month) => (
                      <Badge key={month} variant="success" size="sm">
                        {month.slice(0, 3)}
                      </Badge>
                    ))}
                  </div>

                  <p className="mt-2.5 text-ng-xs leading-relaxed text-ng-secondary">{pair.note}</p>
                </Card>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
