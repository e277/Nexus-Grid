import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { SourcingChart } from "../components/charts/SourcingChart";
import { Panel } from "../components/Panel";
import { usePoll } from "../hooks";
import type { PictureResponse, SourceProvenance } from "../types";

const STATUS_CLASS: Record<SourceProvenance["status"], string> = {
  live: "bg-ng-success-bg text-ng-success-tx border-ng-success-bd",
  cached: "bg-ng-info-bg text-ng-info-tx border-ng-muted-bd",
  empty: "bg-ng-muted text-ng-muted-tx border-ng-muted-bd",
  pending: "bg-ng-info-bg text-ng-info-tx border-ng-muted-bd animate-pulse",
  unauthorized: "bg-ng-warning-bg text-ng-warning-tx border-ng-warning-bd",
  unavailable: "bg-ng-danger-bg text-ng-danger-tx border-ng-danger-bd",
};

const STATUS_MEANING: Record<SourceProvenance["status"], string> = {
  live: "Fetched from the publisher",
  cached: "Publisher unreachable — last good snapshot",
  empty: "Reachable, returned nothing usable",
  pending: "First fetch in progress",
  unauthorized: "Requires credentials this deployment lacks",
  unavailable: "Publisher failed",
};

function usd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

export function SourcesView() {
  const { data, error, refresh } = usePoll<PictureResponse>(() => api.picture(), 12_000);
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
        Failed to load sources: {error}
      </p>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-[10px] border border-ng-border bg-ng-muted" />
        ))}
      </div>
    );
  }

  const states = data.picture.states.filter((s) => s.food_imports_usd > 0);

  return (
    <div className="space-y-5">
      <Panel
        title="Upstream sources"
        subtitle="Everything this platform reads, and whether it is live right now"
        action={{ label: refreshing ? "Refreshing…" : "Refresh all", onClick: forceRefresh }}
        noPad
      >
        <div className="divide-y divide-ng-border">
          {data.sources.map((source) => (
            <div key={`${source.publisher}-${source.endpoint}`} className="px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[source.status]}`}
                >
                  {source.status}
                </span>
                <span className="text-sm font-semibold text-ng-primary">{source.publisher}</span>
                <span className="ml-auto text-[11px] text-ng-secondary">
                  {source.records.toLocaleString()} records
                  {source.covers ? ` · covers ${source.covers}` : ""}
                </span>
              </div>
              <p className="mt-1 break-all font-mono text-ng-2xs text-ng-secondary">
                {source.endpoint}
              </p>
              {source.documentation ? (
                <a
                  href={source.documentation}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 inline-flex items-center gap-1 text-ng-2xs font-medium text-ng-accent underline decoration-dotted underline-offset-2 hover:decoration-solid focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent focus-visible:ring-offset-1"
                >
                  Open {source.publisher}
                  <ExternalLink size={10} aria-hidden />
                </a>
              ) : null}
              <p className="mt-1 text-[11px] text-ng-secondary">
                {STATUS_MEANING[source.status]} · fetched{" "}
                {new Date(source.fetched_at).toLocaleString()}
              </p>
              {source.note ? (
                <p className="mt-1 text-[11px] leading-snug text-ng-warning-tx">{source.note}</p>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Where each state buys its food"
        subtitle="Observed food trade flows, split by whether the supplier sits inside CARICOM"
      >
        <SourcingChart states={data.picture.states} />
      </Panel>

      <Panel
        title="Member states"
        subtitle="Derived from the snapshots above — nothing here is entered by hand"
        noPad
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-ng-border text-[11px] uppercase tracking-[.4px] text-ng-secondary">
              <tr>
                <th className="px-5 py-2.5 font-semibold">State</th>
                <th className="px-3 py-2.5 text-right font-semibold">Food imports</th>
                <th className="px-3 py-2.5 text-right font-semibold">From CARICOM</th>
                <th className="px-3 py-2.5 text-right font-semibold">Food % of imports</th>
                <th className="px-3 py-2.5 text-right font-semibold">Arable land</th>
                <th className="px-3 py-2.5 text-right font-semibold">Climate</th>
              </tr>
            </thead>
            <tbody>
              {states.map((state, i) => (
                <tr key={state.iso3} className={i % 2 ? "bg-ng-row-alt" : ""}>
                  <td className="px-5 py-2 font-medium text-ng-primary">{state.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ng-primary">
                    {usd(state.food_imports_usd)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span
                      className={
                        (state.intra_caricom_share_pct ?? 0) < 10
                          ? "text-ng-danger-tx"
                          : "text-ng-primary"
                      }
                    >
                      {state.intra_caricom_share_pct ?? "—"}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ng-secondary">
                    {state.food_import_share_pct ?? "—"}%
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ng-secondary">
                    {state.arable_land_pct ?? "—"}%
                  </td>
                  <td className="px-3 py-2 text-right text-ng-secondary">
                    {state.climate_risk ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Import substitution candidates"
        subtitle="Where a member state buys outside the region something another member already supplies into it"
        noPad
      >
        <div className="divide-y divide-ng-border">
          {data.picture.substitution_opportunities.map((o) => (
            <div key={`${o.importer_iso3}-${o.commodity_code}`} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold text-ng-primary">{o.importer}</span>
                <span className="text-[11px] text-ng-secondary">{o.commodity}</span>
                <span className="ml-auto font-mono text-[12px] text-ng-danger-tx">
                  {usd(o.external_usd)} external ({o.external_share_pct}%)
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-ng-secondary">
                Already supplied into CARICOM by {o.regional_suppliers.join(", ")} · currently
                buying from {o.top_external_partners.join(", ")}
              </p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
