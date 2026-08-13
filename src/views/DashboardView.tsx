"use client";

import { CircleCheck, Lock, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, streamWorkflow } from "../api";
import { AnalysisView } from "../components/AnalysisView";
import { FormError } from "../components/Fields";
import { SourceBar, type SourceUse } from "../components/SourceBar";
import { ApprovalPanel, type HeldRecommendation } from "../components/pipeline/ApprovalPanel";
import { PipelineDiagram } from "../components/pipeline/PipelineDiagram";
import {
  buildInitialNodes,
  PIPELINE_NODES,
  summarizeUpdate,
  type NodeState,
} from "../components/pipeline/model";
import { PHASES, type PhaseId } from "../components/pipeline/phases";
import { RecommendationCard } from "../components/RecommendationCard";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { PillTabs, type PillOption } from "../components/ui/tabs";
import { usePoll } from "../hooks";
import { cn } from "../lib/utils";
import {
  DASHBOARD_SOURCES,
  FARM_TO_MARKET_SOURCES,
  LOGISTICS_SOURCES,
  PLANTING_SOURCES,
  SOIL_SOURCES,
} from "../source-map";
import type {
  AnalysisDomain,
  GateDecision,
  SourceProvenance,
  SourceSlot,
  SubstitutionOpportunity,
} from "../types";

/**
 * Nodes with exactly one outgoing edge, so the graph's position is known the
 * moment the predecessor lands. `plan` and `monitor` are absent on purpose:
 * both branch, and until the next event arrives there is no honest answer to
 * where the run is.
 */
const SOLE_SUCCESSOR: Record<string, string | undefined> = {
  perceive: "assess",
  assess: "recommend",
  recommend: "plan",
  hold: "recover",
  execute: "monitor",
};

const PHASE_OPTIONS: PillOption<PhaseId | "all">[] = [
  { value: "all", label: "All" },
  ...PHASES.map((phase) => ({
    value: phase.id,
    label: phase.label,
    dot: `var(--phase-${phase.id})`,
  })),
];

const SOURCE_DOT: Record<SourceProvenance["status"], string> = {
  live: "bg-ng-success",
  cached: "bg-ng-info",
  empty: "bg-ng-muted-bd",
  pending: "bg-ng-info animate-pulse",
  unauthorized: "bg-ng-warning",
  unavailable: "bg-ng-danger",
};

const DECISION_COPY: Record<GateDecision, { label: string; tone: "success" | "info" | "danger" | "warning" }> = {
  approved: { label: "Approved", tone: "success" },
  modified: { label: "Approved with amendment", tone: "info" },
  rejected: { label: "Rejected", tone: "danger" },
  escalated: { label: "Escalated", tone: "warning" },
};

function usd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${Math.round(value / 1_000_000)}M`;
  return `$${value.toLocaleString()}`;
}

interface FinalState {
  decision?: string;
  gap_severity?: string;
  gate_decision?: GateDecision;
  gate_note?: string;
  execution?: {
    status?: string;
    task?: string;
    details?: Record<string, unknown>;
    dispatch_mode?: string;
    dispatch_status?: string;
    dispatch_channel?: string;
    dispatch_target?: string;
    dispatch_detail?: string;
  };
  recovery?: Record<string, unknown>;
  // `monitor` is a node name, so the channel it writes is `monitor_result` —
  // LangGraph does not allow a channel to share a name with a node.
  monitor_result?: { disruption_detected?: boolean; will_replan?: boolean };
}

export function DashboardView() {
  const [gaps, setGaps] = useState<SubstitutionOpportunity[]>([]);
  const [climateByIso3, setClimateByIso3] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<SourceProvenance[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .picture()
      .then((data) => {
        setGaps(data.picture.substitution_opportunities);
        setClimateByIso3(
          Object.fromEntries(data.picture.states.map((s) => [s.iso3, s.climate_risk ?? "low"]))
        );
        setSources(data.sources);
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load the regional picture")
      );
  }, []);

  const [gapKey, setGapKey] = useState("");
  const [requireApproval, setRequireApproval] = useState(true);
  const [focus, setFocus] = useState<PhaseId | "all">("all");

  useEffect(() => {
    if (gaps.length && !gapKey) setGapKey(`${gaps[0].importer_iso3}-${gaps[0].commodity_code}`);
  }, [gaps, gapKey]);

  const selected = gaps.find((g) => `${g.importer_iso3}-${g.commodity_code}` === gapKey) ?? null;

  const [nodes, setNodes] = useState<Record<string, NodeState>>(buildInitialNodes());
  const [trace, setTrace] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [interruptPayload, setInterruptPayload] = useState<Record<string, unknown> | null>(null);
  const [recommendation, setRecommendation] = useState<unknown>(null);
  const [decided, setDecided] = useState<GateDecision | null>(null);
  const [finalState, setFinalState] = useState<FinalState | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // A run in flight is a live HTTP stream; leaving the page must end it.
  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * Consume a streamed run, updating the diagram as each node lands.
   *
   * A node is marked `running` only when the graph can be at exactly one
   * place: at the start (the entry node), and after a node whose single
   * outgoing edge is unambiguous. Where the graph branches — `plan`, and
   * `monitor` — nothing is claimed until the next event says which way it
   * went. The alternative is guessing, and a diagram that guesses is the
   * animation this replaced.
   */
  async function consume(body: Record<string, unknown>, signal: AbortSignal) {
    for await (const { event, data } of streamWorkflow(body, signal)) {
      if (event === "started") {
        setThreadId(String(data.thread_id));
        setNodes((prev) => ({ ...prev, perceive: { ...prev.perceive, status: "running" } }));
        continue;
      }

      if (event === "node") {
        const id = String(data.node);
        const update = (data.update ?? {}) as Record<string, unknown>;
        if (!PIPELINE_NODES.some((n) => n.id === id)) continue;

        setTrace((prev) => [...prev, id]);
        setNodes((prev) => {
          const next = {
            ...prev,
            [id]: { ...prev[id], status: "done" as const, summary: summarizeUpdate(id, update) },
          };
          const successor = SOLE_SUCCESSOR[id];
          if (successor && next[successor]?.status !== "done") {
            next[successor] = { ...next[successor], status: "running" };
          }
          return next;
        });

        if (id === "recommend") setRecommendation(update.recommendation);
        setFinalState((data.value ?? null) as FinalState | null);
        continue;
      }

      if (event === "finished") {
        if (data.status === "awaiting_approval") {
          setRunning(false);
          setAwaitingApproval(true);
          setInterruptPayload((data.interrupt ?? null) as Record<string, unknown> | null);
          // The graph is genuinely parked inside `hold` — show that, rather
          // than leaving the node looking untouched.
          setNodes((prev) => ({ ...prev, hold: { ...prev.hold, status: "running" } }));
        } else {
          setRunning(false);
          setNodes((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(next)) {
              if (next[key].status !== "done") next[key] = { ...next[key], status: "skipped" };
            }
            return next;
          });
        }
        continue;
      }

      if (event === "failed") {
        setRunning(false);
        setRunError(String(data.detail ?? "The run failed."));
      }
    }
  }

  async function run() {
    if (!selected || running) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRunning(true);
    setRunError(null);
    setAwaitingApproval(false);
    setInterruptPayload(null);
    setThreadId(null);
    setRecommendation(null);
    setDecided(null);
    setFinalState(null);
    setNodes(buildInitialNodes());
    setTrace([]);

    try {
      await consume(
        {
          event: "substitution_gap",
          commodity: selected.commodity,
          importer: selected.importer,
          importer_iso3: selected.importer_iso3,
          external_usd: selected.external_usd,
          external_share_pct: Math.round(selected.external_share_pct),
          regional_suppliers: selected.regional_suppliers,
          climate_risk: climateByIso3[selected.importer_iso3] ?? "low",
          require_approval: requireApproval,
        },
        controller.signal
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      setRunning(false);
      setRunError(err instanceof Error ? err.message : "Workflow trigger failed");
    }
  }

  /** The one point a run does not proceed on its own. */
  async function decide(decision: GateDecision, note: string | null) {
    if (!threadId) return;
    const controller = new AbortController();
    abortRef.current = controller;

    setResuming(true);
    setRunError(null);
    setAwaitingApproval(false);
    setInterruptPayload(null);
    setDecided(decision);
    setRunning(true);

    try {
      await consume({ thread_id: threadId, decision, note }, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return;
      setRunning(false);
      setRunError(err instanceof Error ? err.message : "Resume failed");
    } finally {
      setResuming(false);
    }
  }

  // ── Derived view models ─────────────────────────────────────────────────
  // Only the slots a run actually reads, paired with what each contributes.
  const runSources = DASHBOARD_SOURCES.map((use) => ({
    ...use,
    source: sources.find((s) => s.slot === use.slot),
  })).filter(
    (row): row is { slot: SourceSlot; contributes: string; source: SourceProvenance } =>
      row.source !== undefined
  );

  const heldExecution = interruptPayload?.execution as
    | { task?: string; details?: Record<string, unknown> }
    | undefined;

  const model = (recommendation ?? null) as {
    source?: string;
    action?: string;
    rationale?: string;
    confidence?: number | null;
    risks?: string[];
  } | null;
  const modelSource = model?.source ?? null;

  const held: HeldRecommendation | null = heldExecution
    ? {
        agent: "plan",
        action: String(heldExecution.task ?? "action"),
        priority: String(heldExecution.details?.priority ?? "normal"),
        target: String(heldExecution.details?.target ?? "—"),
        strategy: (heldExecution.details?.strategy as string | undefined) ?? null,
        // The gate holds a rule-derived plan, so the confidence that matters
        // is the model's own on the recommendation it wraps — reported by the
        // model rather than inferred from which provider answered.
        confidence: typeof model?.confidence === "number" ? model.confidence : null,
        reasoning: model?.rationale?.trim() || null,
        risks: model?.risks ?? [],
        modelSource,
        valueAtStakeUsd:
          typeof heldExecution.details?.volume_at_stake_usd === "number"
            ? (heldExecution.details.volume_at_stake_usd as number)
            : null,
      }
    : null;

  const complete = finalState !== null && !running;
  const activePhase = focus === "all" ? null : focus;

  return (
    <div className="space-y-4">
      {/* ── Control row: what to run it against, the phase filter, the run
             button. One row above everything it scopes. ─────────────────── */}
      <Card className="flex flex-wrap items-center gap-3 p-3">
        {/* Full width on a phone, then shares the row from `sm` up — inside a
            wrapping flex row a `flex-1` select collapses to nothing once the
            row is narrower than its siblings. */}
        <label className="flex w-full min-w-0 items-center gap-2 text-ng-xs font-semibold uppercase tracking-[.6px] text-ng-secondary sm:w-auto sm:flex-1">
          <span className="shrink-0">Sourcing gap</span>
          <select
            value={gapKey}
            onChange={(e) => setGapKey(e.target.value)}
            disabled={running || awaitingApproval}
            className="w-full min-w-0 flex-1 rounded-md border border-ng-border bg-ng-bg px-2.5 py-1.5 text-ng-sm font-normal normal-case tracking-normal text-ng-primary focus:outline-none focus-visible:border-ng-accent focus-visible:ring-2 focus-visible:ring-ng-accent disabled:opacity-60"
          >
            {gaps.length === 0 ? <option value="">Loading live trade data…</option> : null}
            {gaps.map((g) => (
              <option key={`${g.importer_iso3}-${g.commodity_code}`} value={`${g.importer_iso3}-${g.commodity_code}`}>
                {g.importer} · {g.commodity} · {usd(g.external_usd)} external (
                {g.external_share_pct}%)
              </option>
            ))}
          </select>
        </label>

        <label className="flex shrink-0 items-center gap-2 text-ng-xs text-ng-secondary">
          <input
            type="checkbox"
            checked={requireApproval}
            disabled={running || awaitingApproval}
            onChange={(e) => setRequireApproval(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-ng-border text-ng-accent focus:ring-ng-accent"
          />
          Gate urgent plans
        </label>

        <Button onClick={run} disabled={running || awaitingApproval || !selected} className="shrink-0 rounded-full">
          {running ? (
            <>
              <RotateCcw size={14} className="animate-spin" aria-hidden />
              Running…
            </>
          ) : (
            <>
              <Play size={14} aria-hidden />
              Run Cycle
            </>
          )}
        </Button>
      </Card>

      <PillTabs
        label="Filter the diagram by phase"
        options={PHASE_OPTIONS}
        value={focus}
        onChange={setFocus}
      />

      {loadError ? <FormError message={loadError} /> : null}
      {runError ? <FormError message={runError} /> : null}

      {selected ? (
        <p className="text-ng-sm leading-relaxed text-ng-secondary">
          <span className="font-semibold text-ng-primary">{selected.importer}</span> buys{" "}
          {usd(selected.external_usd)} of {selected.commodity.toLowerCase()} outside CARICOM (
          {selected.external_share_pct}% of its imports of that commodity), while{" "}
          {selected.regional_suppliers.slice(0, 3).join(", ") || "no member state"} already
          supplies it into the region.
        </p>
      ) : null}

      {/* ── The loop ────────────────────────────────────────────────────── */}
      <Card className="p-3 sm:p-4">
        <PipelineDiagram
          nodes={nodes}
          trace={trace}
          focus={activePhase}
          awaitingApproval={awaitingApproval}
          modelSource={modelSource === "minimax" ? "MiniMax" : modelSource ? "Rule-based" : null}
        />

        {/* Data source legend — the two publishers a run actually reads, not
            all six. The per-edge badges on the diagram say where each one
            enters the loop; this row says whether it is answering. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-ng-border pt-3">
          <span className="text-ng-2xs font-bold uppercase tracking-[.7px] text-ng-secondary">
            Data behind a run
          </span>
          {runSources.length === 0 ? (
            <span className="text-ng-2xs text-ng-secondary">Loading…</span>
          ) : (
            runSources.map(({ source, contributes }) => (
              <span
                key={source.slot}
                className="flex items-center gap-1.5 text-ng-2xs text-ng-secondary"
                title={`${source.publisher} — ${source.status}, ${source.records.toLocaleString()} records.\n${contributes}`}
              >
                <span
                  aria-hidden
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", SOURCE_DOT[source.status])}
                />
                {source.publisher}
                <span className="text-ng-disabled">({source.status})</span>
              </span>
            ))
          )}
          <span className="text-ng-2xs text-ng-secondary">
            · the recommendation step additionally calls the configured model
          </span>
        </div>
      </Card>

      {/* ── The gate ────────────────────────────────────────────────────── */}
      {awaitingApproval && held ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-ng-warning-bd bg-ng-warning-bg px-4 py-3">
            <Lock size={15} className="shrink-0 text-ng-warning-tx" aria-hidden />
            <p className="text-ng-base font-semibold text-ng-warning-tx">
              Pipeline paused — awaiting human approval
            </p>
            <p className="w-full text-ng-sm text-ng-warning-tx sm:w-auto sm:border-l sm:border-ng-warning-bd sm:pl-2">
              The run continues the moment a decision is recorded below.
            </p>
          </div>
          <ApprovalPanel recommendation={held} onDecide={decide} busy={resuming} />
        </div>
      ) : null}

      {decided && !awaitingApproval ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-ng-border bg-ng-surface px-4 py-2.5">
          <CircleCheck size={15} className="shrink-0 text-ng-accent" aria-hidden />
          <span className="text-ng-sm text-ng-secondary">Gate decision recorded:</span>
          <Badge variant={DECISION_COPY[decided].tone}>{DECISION_COPY[decided].label}</Badge>
        </div>
      ) : null}

      {/* ── Results: only once the run has actually finished ────────────── */}
      {complete && finalState ? (
        <ResultsSection state={finalState} recommendation={recommendation} />
      ) : null}

      {/* ── Intelligence ─────────────────────────────────────────────────
          The four domain readings, under the loop that acts on them. They
          were four pages, which put the reasoning a navigation step away from
          the run it justifies: an operator deciding at the gate wants the
          market and weather readings on the same screen as the decision. */}
      <IntelligenceSection />
    </div>
  );
}

const DOMAIN_TABS: PillOption<AnalysisDomain>[] = [
  { value: "market", label: "Farm-to-Market" },
  { value: "soil", label: "Soil & Crop Intel" },
  { value: "planting", label: "Planting Coordination" },
  { value: "logistics", label: "Port & Logistics" },
];

const DOMAIN_SOURCES: Record<string, SourceUse[]> = {
  market: FARM_TO_MARKET_SOURCES,
  soil: SOIL_SOURCES,
  planting: PLANTING_SOURCES,
  logistics: LOGISTICS_SOURCES,
};

/**
 * The four domain readings, one at a time.
 *
 * A switcher rather than four stacked sections: each reading is a summary plus
 * three to five findings with evidence, and rendering all four at once buries
 * the loop above them under several screens of text. The tabs keep every
 * domain one click away without making the page a scroll.
 */
function IntelligenceSection() {
  const [domain, setDomain] = useState<AnalysisDomain>("market");
  const { data, error } = usePoll(() => api.analysis(domain), 20_000, [domain]);
  const [rereading, setRereading] = useState(false);

  async function reread() {
    setRereading(true);
    try {
      await api.analysis(domain, true);
    } catch {
      // The panel keeps the last reading; the poll retries.
    } finally {
      setRereading(false);
    }
  }

  return (
    <div className="space-y-4 border-t border-ng-border pt-5">
      <div>
        <h2 className="text-ng-lg font-bold tracking-tight text-ng-primary">Regional intelligence</h2>
        <p className="mt-0.5 max-w-3xl text-ng-sm text-ng-secondary">
          What the agents read across the region — the reasoning a coordination run acts on.
        </p>
      </div>

      <PillTabs
        label="Choose an intelligence domain"
        options={DOMAIN_TABS}
        value={domain}
        onChange={setDomain}
      />

      {error ? (
        <p className="rounded-md border border-ng-warning-bd bg-ng-warning-bg px-4 py-3 text-sm text-ng-warning-tx">
          Failed to load the {domain} analysis: {error}
        </p>
      ) : (
        <>
          {data ? <SourceBar sources={data.sources} uses={DOMAIN_SOURCES[domain] ?? []} /> : null}
          <AnalysisView
            analysis={data?.analysis ?? null}
            onRefresh={reread}
            refreshing={rereading}
          />
        </>
      )}
    </div>
  );
}

function ResultsSection({
  state,
  recommendation,
}: {
  state: FinalState;
  recommendation: unknown;
}) {
  const severity = state.gap_severity ?? "—";
  const severityTone =
    severity === "critical" ? "danger" : severity === "material" ? "warning" : "muted";
  const disrupted = state.monitor_result?.disruption_detected ?? false;
  const replanned = state.monitor_result?.will_replan ?? false;

  const dispatch = state.execution?.dispatch_status ?? null;
  const dispatchCopy: Record<string, { label: string; tone: "success" | "warning" | "danger" }> = {
    delivered: { label: "Delivered to the desk", tone: "success" },
    skipped: { label: "Not delivered", tone: "warning" },
    failed: { label: "Delivery failed", tone: "danger" },
  };

  const actions = [
    state.decision ? `Assessed as: ${state.decision.replace(/_/g, " ")}` : null,
    state.execution?.task ? `Planned action: ${String(state.execution.task).replace(/_/g, " ")}` : null,
    state.execution?.status ? `Execution status: ${state.execution.status}` : null,
    state.execution?.dispatch_detail ? `Dispatch: ${state.execution.dispatch_detail}` : null,
    state.recovery?.recovery_action
      ? `Follow-up: ${String(state.recovery.recovery_action).replace(/_/g, " ")} → ${String(state.recovery.next_step ?? "—").replace(/_/g, " ")}`
      : null,
    state.gate_note ? `Operator note: ${state.gate_note}` : null,
  ].filter((entry): entry is string => entry !== null);

  const affected = (state.execution?.details?.target as string | undefined) ?? null;

  return (
    <Card>
      <div className="border-b border-ng-border px-4 py-3">
        <h2 className="text-ng-base font-semibold text-ng-primary">Run outcome</h2>
        <p className="mt-0.5 text-ng-xs text-ng-secondary">
          What the loop concluded, and the state it left behind.
        </p>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-1">
          <div>
            <p className="text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
              Gap severity
            </p>
            <Badge variant={severityTone} className="mt-1 capitalize">
              {severity}
            </Badge>
          </div>
          <div>
            <p className="text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
              Disruption
            </p>
            <Badge variant={disrupted ? "warning" : "success"} className="mt-1">
              {disrupted ? (replanned ? "Detected — re-planned once" : "Detected") : "None detected"}
            </Badge>
          </div>
          {affected ? (
            <div>
              <p className="text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
                Directed at
              </p>
              <p className="mt-1 text-ng-sm text-ng-primary">{affected}</p>
            </div>
          ) : null}
          {/* Whether the plan actually reached anyone. Without a gateway
              configured this reads "not delivered", never "done". */}
          {dispatch ? (
            <div>
              <p className="text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
                Dispatch
              </p>
              <Badge variant={dispatchCopy[dispatch]?.tone ?? "muted"} className="mt-1">
                {dispatchCopy[dispatch]?.label ?? dispatch}
              </Badge>
              {state.execution?.dispatch_target ? (
                <p className="mt-1 text-ng-2xs text-ng-secondary">
                  via OpenClaw → {state.execution.dispatch_target}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-2">
          <p className="text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
            What happened
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {actions.map((action) => (
              <li key={action} className="flex gap-2 text-ng-sm leading-relaxed text-ng-primary">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ng-accent" aria-hidden />
                {action}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {recommendation ? (
        <div className="border-t border-ng-border p-4">
          <RecommendationCard recommendation={recommendation} />
        </div>
      ) : null}
    </Card>
  );
}
