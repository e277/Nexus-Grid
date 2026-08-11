import { useState } from "react";
import { api } from "../api";
import { Panel } from "../components/Panel";
import { Badge } from "../components/ui/badge";
import { StatTile } from "../components/StatTile";
import { usePoll } from "../hooks";
import type { CoordinationSignal, SignalsResponse } from "../types";

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

const CONFIDENCE_CLASS: Record<CoordinationSignal["confidence"], string> = {
  high: "text-ng-success-tx",
  medium: "text-ng-warning-tx",
  low: "text-ng-secondary",
};

function usd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

export function SignalsView() {
  const { data, error, refresh } = usePoll<SignalsResponse>(() => api.signals(), 12_000);
  const [refreshing, setRefreshing] = useState(false);

  async function forceRefresh() {
    setRefreshing(true);
    try {
      // Fire-and-forget: the sweep takes over a minute server-side, and the
      // poll below picks the results up as each publisher answers.
      await api.refreshSources();
      refresh();
    } finally {
      setRefreshing(false);
    }
  }

  if (error) {
    return (
      <p className="rounded-md border border-ng-warning-bd bg-ng-warning-bg px-4 py-3 text-sm text-ng-warning-tx">
        Failed to interpret sources: {error}
      </p>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-[10px] border border-ng-border bg-ng-muted" />
          ))}
        </div>
        <p className="text-sm text-ng-secondary">
          Fetching upstream sources and interpreting them — the first run queries every publisher.
        </p>
      </div>
    );
  }

  const interpreted = data.source !== "rules";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatTile
          label="Food imports observed"
          value={usd(data.totals.food_imports_usd)}
          hint={`Across ${data.totals.states_covered} member states · UN Comtrade ${data.totals.trade_year ?? ""}`}
        />
        <StatTile
          label="Sourced within CARICOM"
          value={`${data.totals.intra_caricom_share_pct ?? "—"}%`}
          hint={`${usd(data.totals.intra_caricom_usd)} of regional food imports`}
          delta={{
            label:
              (data.totals.intra_caricom_share_pct ?? 0) < 20
                ? "Most food comes from outside the region"
                : "Regional sourcing",
            kind: (data.totals.intra_caricom_share_pct ?? 0) < 20 ? "warn" : "up",
          }}
        />
        <StatTile
          label="Coordination signals"
          value={data.signals.length}
          hint={
            interpreted
              ? `Interpreted by ${data.source}`
              : "Rule-derived — no model configured"
          }
        />
      </div>

      <Panel
        title="Coordination signals"
        subtitle="Opportunities no single member state can see from its own systems"
        action={{ label: refreshing ? "Refreshing…" : "Refresh sources", onClick: forceRefresh }}
        noPad
      >
        {data.note ? (
          <p className="border-b border-ng-border bg-ng-warning-bg px-5 py-2.5 text-[12px] text-ng-warning-tx">
            {data.note}
          </p>
        ) : null}

        <div className="divide-y divide-ng-border">
          {data.signals.map((signal, index) => (
            <article key={`${signal.title}-${index}`} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={KIND_VARIANT[signal.kind]}>{KIND_LABEL[signal.kind]}</Badge>
                <h3 className="text-sm font-semibold text-ng-primary">{signal.title}</h3>
                <span className={`ml-auto text-[11px] font-semibold ${CONFIDENCE_CLASS[signal.confidence]}`}>
                  {signal.confidence} confidence
                </span>
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
                    <li key={i} className="font-mono text-[11px] leading-snug text-ng-secondary">
                      · {item}
                    </li>
                  ))}
                </ul>
              ) : null}

              {signal.states.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {signal.states.map((state) => (
                    <span
                      key={state}
                      className="rounded border border-ng-muted-bd bg-ng-muted px-1.5 py-0.5 font-mono text-ng-2xs text-ng-muted-tx"
                    >
                      {state}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </Panel>

      <p className="text-[11px] text-ng-secondary">
        Generated {new Date(data.generated_at).toLocaleString()} from{" "}
        {data.sources.filter((s) => s.status === "live").length} live source(s). This layer
        interprets data it does not own — every figure above traces back to a published source.
      </p>
    </div>
  );
}
