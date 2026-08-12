"use client";

import { Globe, Radio, ShoppingBasket, TrendingDown } from "lucide-react";
import { useState } from "react";

import { api } from "../api";
import { GapChart } from "../components/charts/GapChart";
import { Matrix, MatrixLegend, type MatrixCell } from "../components/charts/Matrix";
import { DataTable } from "../components/DataTable";
import { Panel } from "../components/Panel";
import { SourceBar } from "../components/SourceBar";
import { StatTile } from "../components/StatTile";
import { Badge } from "../components/ui/badge";
import { ViewSkeleton } from "../components/ui/skeleton";
import { usePoll } from "../hooks";
import { FARM_TO_MARKET_SOURCES } from "../source-map";
import type { CoordinationSignal, SubstitutionOpportunity } from "../types";

const KIND_LABEL: Record<CoordinationSignal["kind"], string> = {
  import_substitution: "Import substitution",
  production_alignment: "Production alignment",
  climate_exposure: "Climate exposure",
  logistics: "Logistics",
  data_gap: "Data gap",
};

const KIND_VARIANT: Record<
  CoordinationSignal["kind"],
  "default" | "success" | "warning" | "info" | "muted"
> = {
  import_substitution: "default",
  production_alignment: "success",
  climate_exposure: "warning",
  logistics: "info",
  data_gap: "muted",
};

const CONFIDENCE_VARIANT: Record<CoordinationSignal["confidence"], "success" | "warning" | "muted"> =
  { high: "success", medium: "warning", low: "muted" };

function usd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${Math.round(value / 1_000_000)}M`;
  return `$${value.toLocaleString()}`;
}

async function load() {
  const [picture, signals] = await Promise.all([
    api.picture(),
    api.signals().catch(() => null),
  ]);
  return { picture, signals };
}

export function FarmToMarketView() {
  const { data, error, refresh } = usePoll(load, 20_000);
  const [refreshing, setRefreshing] = useState(false);

  async function forceRefresh() {
    setRefreshing(true);
    try {
      // Fire-and-forget: the sweep takes over a minute server-side and the
      // poll picks results up as each publisher answers.
      await api.refreshSources();
      refresh();
    } finally {
      setRefreshing(false);
    }
  }

  if (error) {
    return (
      <p className="rounded-md border border-ng-warning-bd bg-ng-warning-bg px-4 py-3 text-sm text-ng-warning-tx">
        Failed to load the market picture: {error}
      </p>
    );
  }

  if (!data) return <ViewSkeleton tiles={4} panels={2} />;

  const { picture, sources } = data.picture;
  const gaps = picture.substitution_opportunities;
  const totals = picture.totals;
  const largest = gaps[0] ?? null;
  const addressable = gaps.reduce((sum, g) => sum + g.external_usd, 0);
  const signals = data.signals?.signals ?? [];
  // `source` is the model that interpreted them, or "rules" when no key is set.
  const interpretedBy =
    data.signals && data.signals.source !== "rules" ? data.signals.source : null;

  // Commodity × importer external-share matrix. Sequential magnitude, so one
  // hue light→dark; the percentage is printed in every cell.
  const commodities = [...new Set(gaps.map((g) => g.commodity))].slice(0, 8);
  const importers = [...new Set(gaps.map((g) => g.importer))].slice(0, 10);
  const byCell = new Map(
    gaps.map((g) => [`${g.importer}|${g.commodity}`, g] as const)
  );

  function cell(importer: string, commodity: string): MatrixCell {
    const gap = byCell.get(`${importer}|${commodity}`);
    if (!gap) {
      return { label: "—", intensity: null, title: `${importer} · ${commodity}: no observed gap` };
    }
    return {
      label: `${Math.round(gap.external_share_pct)}%`,
      intensity: Math.min(1, gap.external_share_pct / 100),
      title: `${importer} buys ${usd(gap.external_usd)} of ${gap.commodity.toLowerCase()} outside CARICOM — ${gap.external_share_pct}% of its imports of that commodity`,
    };
  }

  return (
    <div className="space-y-5">
      <SourceBar
        sources={sources}
        uses={FARM_TO_MARKET_SOURCES}
        onRefresh={forceRefresh}
        refreshing={refreshing}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Food imports observed"
          value={usd(totals.food_imports_usd)}
          icon={<Globe size={13} />}
          tone="info"
          hint={`${totals.states_covered} member states · UN Comtrade ${totals.trade_year ?? ""}`}
        />
        <StatTile
          label="Sourced within CARICOM"
          value={`${totals.intra_caricom_share_pct ?? "—"}%`}
          icon={<TrendingDown size={13} />}
          tone={(totals.intra_caricom_share_pct ?? 0) < 20 ? "warning" : "success"}
          hint={`${usd(totals.intra_caricom_usd)} of the regional food bill`}
          delta={{
            label:
              (totals.intra_caricom_share_pct ?? 0) < 20
                ? "Most food comes from outside"
                : "Regional sourcing holding",
            kind: (totals.intra_caricom_share_pct ?? 0) < 20 ? "warn" : "up",
          }}
        />
        <StatTile
          label="Addressable by substitution"
          value={usd(addressable)}
          icon={<ShoppingBasket size={13} />}
          tone="accent"
          hint={`Across ${gaps.length} commodity–importer pairs a member state already supplies`}
        />
        <StatTile
          label="Largest single gap"
          value={largest ? usd(largest.external_usd) : "—"}
          icon={<Radio size={13} />}
          tone="danger"
          hint={
            largest
              ? `${largest.importer} · ${largest.commodity} · ${largest.external_share_pct}% external`
              : "No gaps in the current snapshot"
          }
        />
      </div>

      <Panel
        title="Where the money leaves the region"
        subtitle="Each bar is one commodity for one importer: what it already buys inside CARICOM, against what it still buys outside"
      >
        <GapChart opportunities={gaps} />
      </Panel>

      <Panel
        title="External sourcing by commodity and importer"
        subtitle="Share of each commodity’s imports that comes from outside the region — darker means more of it is bought externally"
      >
        <Matrix
          columns={commodities}
          rows={importers}
          cell={cell}
          legend={<MatrixLegend low="0% external" high="100% external" />}
        />
      </Panel>

      <Panel
        title="Supply–demand gap analysis"
        subtitle="Every pair where a member state buys outside the region something another member already supplies into it"
        noPad
      >
        <DataTable<SubstitutionOpportunity>
          rows={gaps}
          rowKey={(g) => `${g.importer_iso3}-${g.commodity_code}`}
          pageSize={8}
          searchPlaceholder="Search commodity, importer, supplier…"
          empty="No substitution candidates in the current trade snapshot."
          columns={[
            {
              label: "Importer",
              sortValue: (g) => g.importer,
              render: (g) => <span className="font-medium">{g.importer}</span>,
            },
            { label: "Commodity", sortValue: (g) => g.commodity, render: (g) => g.commodity },
            {
              label: "External",
              numeric: true,
              sortValue: (g) => g.external_usd,
              render: (g) => <span className="text-ng-danger-tx">{usd(g.external_usd)}</span>,
            },
            {
              label: "External share",
              numeric: true,
              sortValue: (g) => g.external_share_pct,
              render: (g) => `${g.external_share_pct}%`,
            },
            {
              label: "Already supplied by",
              sortValue: (g) => g.regional_suppliers.join(", "),
              render: (g) => (
                <span className="text-ng-secondary">{g.regional_suppliers.join(", ") || "—"}</span>
              ),
            },
            {
              label: "Currently buying from",
              sortValue: (g) => g.top_external_partners.join(", "),
              render: (g) => (
                <span className="text-ng-secondary">
                  {g.top_external_partners.join(", ") || "—"}
                </span>
              ),
            },
          ]}
        />
      </Panel>

      {/* The only block on this page that is not pure trade data: the
          interpretation step reads the whole regional picture, so it is
          attributed on the panel rather than widening the page's source list
          to publishers none of the figures above come from. */}
      <Panel
        title="Coordination signals"
        subtitle={
          interpretedBy
            ? `Interpreted by ${interpretedBy} across every source in the regional picture — soil, climate, planting calendars and trade together`
            : "Rule-derived from the full regional picture — soil, climate, planting calendars and trade together"
        }
        noPad
      >
        {data.signals?.note ? (
          <p className="border-b border-ng-border bg-ng-warning-bg px-5 py-2.5 text-ng-xs text-ng-warning-tx">
            {data.signals.note}
          </p>
        ) : null}

        {signals.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ng-secondary">
            No signals yet — the interpretation step runs once the sources have answered.
          </p>
        ) : (
          <div className="divide-y divide-ng-border">
            {signals.map((signal, index) => (
              <article key={`${signal.title}-${index}`} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={KIND_VARIANT[signal.kind]}>{KIND_LABEL[signal.kind]}</Badge>
                  <h3 className="text-sm font-semibold text-ng-primary">{signal.title}</h3>
                  <Badge variant={CONFIDENCE_VARIANT[signal.confidence]} className="ml-auto">
                    {signal.confidence} confidence
                  </Badge>
                </div>

                <p className="mt-2 text-sm leading-relaxed text-ng-primary">{signal.finding}</p>

                {signal.recommendation ? (
                  <p className="mt-2 border-l-2 border-ng-accent pl-3 text-sm leading-relaxed text-ng-secondary">
                    {signal.recommendation}
                  </p>
                ) : null}

                {signal.evidence.length > 0 ? (
                  <ul className="mt-2.5 space-y-1">
                    {signal.evidence.map((item, i) => (
                      <li key={i} className="font-mono text-ng-xs leading-snug text-ng-secondary">
                        · {item}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {signal.states.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {signal.states.map((state) => (
                      <Badge key={state} variant="muted" size="sm" className="font-mono">
                        {state}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
