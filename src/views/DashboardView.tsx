"use client";

import { Circle, CircleCheck, Lock, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, streamWorkflow } from "../api";
import { FormError } from "../components/Fields";
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
import { cn } from "../lib/utils";
import { DASHBOARD_SOURCES } from "../source-map";
import type {
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
        // Left in the projection's order: largest gap first, so the sweep
        // works through the biggest money before the smallest.
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

  /** The sweep: every observed gap, run one after another. */
  const gapsRef = useRef<SubstitutionOpportunity[]>([]);
  const [queueIndex, setQueueIndex] = useState<number | null>(null);
  const [completed, setCompleted] = useState<{ gap: SubstitutionOpportunity; state: FinalState }[]>([]);
  const [requireApproval, setRequireApproval] = useState(true);
  const [focus, setFocus] = useState<PhaseId | "all">("all");



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
  /** Mirrors `finalState` so the parallel sweep can bank it after awaiting. */
  const finalStateRef = useRef<FinalState | null>(null);

  const done = new Map(
    completed.map(({ gap, state }) => [`${gap.importer_iso3}-${gap.commodity_code}`, state])
  );

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
  async function consume(
    body: Record<string, unknown>,
    signal: AbortSignal,
    /**
     * Whether this run drives the diagram.
     *
     * In a parallel sweep only one does. The diagram shows a single graph
     * traversal, and twelve runs writing to it would render a composite of
     * twelve different positions — a picture of no run in particular.
     */
    options: { drivesDiagram: boolean; gap: SubstitutionOpportunity | null } = {
      drivesDiagram: true,
      gap: null,
    }
  ) {
    const { drivesDiagram, gap } = options;
    for await (const { event, data } of streamWorkflow(body, signal)) {
      if (event === "started") {
        if (!drivesDiagram) continue;
        setThreadId(String(data.thread_id));
        setNodes((prev) => ({ ...prev, perceive: { ...prev.perceive, status: "running" } }));
        continue;
      }

      if (event === "node") {
        const id = String(data.node);
        const update = (data.update ?? {}) as Record<string, unknown>;
        if (!drivesDiagram || !PIPELINE_NODES.some((n) => n.id === id)) continue;

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
        finalStateRef.current = (data.value ?? null) as FinalState | null;
        setFinalState(finalStateRef.current);
        continue;
      }

      if (event === "finished") {
        // A parallel run banks its own outcome and nothing else; the sweep is
        // finished when every promise settles, not when one of them does.
        if (!drivesDiagram) {
          if (gap) {
            setCompleted((done) => [...done, { gap, state: (data.value ?? {}) as FinalState }]);
          }
          continue;
        }

        if (data.status === "awaiting_approval") {
          setRunning(false);
          setAwaitingApproval(true);
          setInterruptPayload((data.interrupt ?? null) as Record<string, unknown> | null);
          // The graph is genuinely parked inside `hold` — show that, rather
          // than leaving the node looking untouched.
          setNodes((prev) => ({ ...prev, hold: { ...prev.hold, status: "running" } }));
        } else {
          setNodes((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(next)) {
              if (next[key].status !== "done") next[key] = { ...next[key], status: "skipped" };
            }
            return next;
          });
          // Bank this gap's outcome, then continue the sweep.
          setQueueIndex((index) => {
            if (index === null) {
              setRunning(false);
              return null;
            }
            const gap = gapsRef.current[index];
            setCompleted((done) => [...done, { gap, state: (data.value ?? {}) as FinalState }]);
            void runFrom(index + 1);
            return index;
          });
        }
        continue;
      }

      if (event === "failed") {
        if (drivesDiagram) setRunning(false);
        setRunError(String(data.detail ?? "The run failed."));
      }
    }
  }

  /**
   * Run one gap, then the next.
   *
   * Every observed gap goes through the loop rather than one an operator
   * picked: choosing which to run made the console ask a question it had no
   * basis to answer — the ranking of what matters is the agents' job, and a
   * dropdown quietly limited a sweep to whatever was selected.
   *
   * Sequential, not parallel. A gap that reaches the approval gate stops the
   * queue where it is, because the whole point of the gate is that a human
   * decides before anything downstream happens; firing twelve runs at once
   * would produce twelve simultaneous gates and no way to answer them in
   * order. `decide()` restarts the queue at the next gap.
   */
  async function runFrom(index: number) {
    const queue = gapsRef.current;
    if (index >= queue.length) {
      setRunning(false);
      setQueueIndex(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const gap = queue[index];
    setQueueIndex(index);
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
          commodity: gap.commodity,
          importer: gap.importer,
          importer_iso3: gap.importer_iso3,
          external_usd: gap.external_usd,
          external_share_pct: Math.round(gap.external_share_pct),
          regional_suppliers: gap.regional_suppliers,
          climate_risk: climateByIso3[gap.importer_iso3] ?? "low",
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

  /**
   * Every gap, in parallel when nothing can stop to ask.
   *
   * Sequential exists only because of the approval gate: twelve concurrent
   * runs that each hold an urgent plan would raise twelve simultaneous gates,
   * with no order to answer them in and a diagram that can only show one — an
   * operator would be approving plans whose reasoning is not on screen.
   *
   * With the gate off nothing pauses, so that objection disappears and the
   * sweep runs concurrently. The diagram follows the first run; the checklist
   * is what shows all of them, and it is the honest view of a parallel sweep.
   */
  async function runAll() {
    if (running || gaps.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    gapsRef.current = gaps;
    setCompleted([]);
    setRunError(null);

    if (requireApproval) {
      void runFrom(0);
      return;
    }

    setRunning(true);
    setQueueIndex(0);
    setAwaitingApproval(false);
    setInterruptPayload(null);
    setThreadId(null);
    setRecommendation(null);
    setDecided(null);
    setFinalState(null);
    setNodes(buildInitialNodes());
    setTrace([]);

    const body = (gap: SubstitutionOpportunity) => ({
      event: "substitution_gap",
      commodity: gap.commodity,
      importer: gap.importer,
      importer_iso3: gap.importer_iso3,
      external_usd: gap.external_usd,
      external_share_pct: Math.round(gap.external_share_pct),
      regional_suppliers: gap.regional_suppliers,
      climate_risk: climateByIso3[gap.importer_iso3] ?? "low",
      require_approval: false,
    });

    const outcomes = await Promise.allSettled(
      gaps.map((gap, index) =>
        consume(body(gap), controller.signal, { drivesDiagram: index === 0, gap })
      )
    );

    if (controller.signal.aborted) return;

    // The first run drives the diagram but banks nothing, so bank it here.
    const first = gaps[0];
    if (first) {
      setCompleted((done) =>
        done.some((d) => d.gap.commodity_code === first.commodity_code && d.gap.importer_iso3 === first.importer_iso3)
          ? done
          : [...done, { gap: first, state: (finalStateRef.current ?? {}) as FinalState }]
      );
    }

    const failed = outcomes.filter((o) => o.status === "rejected").length;
    if (failed > 0) {
      setRunError(`${failed} of ${gaps.length} runs failed. The rest completed.`);
    }
    setRunning(false);
    setQueueIndex(null);
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

      <PillTabs
        label="Filter the diagram by phase"
        options={PHASE_OPTIONS}
        value={focus}
        onChange={setFocus}
      />

      {loadError ? <FormError message={loadError} /> : null}
      {runError ? <FormError message={runError} /> : null}


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

      {/* ── The sweep control, under the diagram it drives ──────────────
             Above the diagram it read as a form to fill in before anything
             happened. Below it, the button sits next to the flow it starts
             and the checklist it advances, which is the order the page is
             actually read in. */}
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-ng-xs font-semibold uppercase tracking-[.6px] text-ng-secondary">
            Coordination sweep
          </p>
          <p className="mt-0.5 truncate text-ng-sm text-ng-primary">
            {gaps.length === 0
              ? "Loading live trade data…"
              : `${gaps.length} sourcing gap${gaps.length === 1 ? "" : "s"}`}
          </p>
        </div>

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

        <span className="shrink-0 text-ng-2xs text-ng-secondary">
          {requireApproval
            ? "runs one at a time so each gate can be answered in turn"
            : "runs all gaps at once — nothing pauses"}
        </span>

        <Button
          onClick={runAll}
          disabled={running || awaitingApproval || gaps.length === 0}
          className="shrink-0 rounded-full"
        >
          {running ? (
            <>
              <RotateCcw size={14} className="animate-spin" aria-hidden />
              Running…
            </>
          ) : (
            <>
              <Play size={14} aria-hidden />
              Run sweep
            </>
          )}
        </Button>
      </Card>

      {/* ── The gate ────────────────────────────────────────────────────
             Always on screen, inert until a run parks here. A control that
             appears and vanishes reads as incidental, and this is the one
             point in the loop where a run is not autonomous. */}
      {awaitingApproval ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-ng-warning-bd bg-ng-warning-bg px-4 py-3">
          <Lock size={15} className="shrink-0 text-ng-warning-tx" aria-hidden />
          <p className="text-ng-base font-semibold text-ng-warning-tx">
            Sweep paused — awaiting human approval
          </p>
          <p className="w-full text-ng-sm text-ng-warning-tx sm:w-auto sm:border-l sm:border-ng-warning-bd sm:pl-2">
            The next gap starts the moment a decision is recorded.
          </p>
        </div>
      ) : null}

      <ApprovalPanel
        recommendation={held}
        onDecide={decide}
        busy={resuming}
        active={awaitingApproval && held !== null}
        gateEnabled={requireApproval}
      />

      {decided && !awaitingApproval ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-ng-border bg-ng-surface px-4 py-2.5">
          <CircleCheck size={15} className="shrink-0 text-ng-accent" aria-hidden />
          <span className="text-ng-sm text-ng-secondary">Gate decision recorded:</span>
          <Badge variant={DECISION_COPY[decided].tone}>{DECISION_COPY[decided].label}</Badge>
        </div>
      ) : null}

      {/* ── The sweep, as a checklist ────────────────────────────────────
             Every gap is listed from the start and ticks off as it finishes.
             Showing only the completed ones hid the shape of the work: a
             reader could not tell whether two done meant two of three or two
             of twelve, and the gap currently in the diagram had no place in
             the list it came from. */}
      {gaps.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-ng-border px-4 py-2.5">
            <h2 className="text-ng-base font-semibold text-ng-primary">Sourcing gaps</h2>
            <span className="text-ng-2xs text-ng-secondary">
              {done.size} of {gaps.length} swept
            </span>
            <span className="ml-auto h-1.5 w-32 overflow-hidden rounded-full bg-ng-muted">
              <span
                className="block h-full rounded-full bg-ng-accent transition-[width] duration-300"
                style={{ width: `${(done.size / gaps.length) * 100}%` }}
              />
            </span>
          </div>

          <ul className="divide-y divide-ng-border">
            {gaps.map((gap, index) => {
              const key = `${gap.importer_iso3}-${gap.commodity_code}`;
              const outcome = done.get(key) ?? null;
              const active = queueIndex === index && running;

              return (
                <li key={key} className="flex flex-wrap items-center gap-2 px-4 py-2">
                  {/* State is a glyph, not just a colour: done, running, or
                      not yet reached. */}
                  {outcome ? (
                    <CircleCheck size={14} className="shrink-0 text-ng-success" aria-label="Swept" />
                  ) : active ? (
                    <RotateCcw
                      size={14}
                      className="shrink-0 animate-spin text-ng-accent"
                      aria-label="Running"
                    />
                  ) : (
                    <Circle size={14} className="shrink-0 text-ng-disabled" aria-label="Waiting" />
                  )}

                  <span
                    className={cn(
                      "text-ng-sm font-medium",
                      outcome || active ? "text-ng-primary" : "text-ng-secondary"
                    )}
                  >
                    {gap.importer} · {gap.commodity}
                  </span>
                  <span className="text-ng-2xs tabular-nums text-ng-secondary">
                    {usd(gap.external_usd)} external
                  </span>

                  {outcome?.gap_severity ? (
                    <Badge
                      size="sm"
                      variant={
                        outcome.gap_severity === "critical"
                          ? "danger"
                          : outcome.gap_severity === "material"
                            ? "warning"
                            : "muted"
                      }
                    >
                      {outcome.gap_severity}
                    </Badge>
                  ) : null}
                  {outcome?.gate_decision ? (
                    <Badge size="sm" variant={DECISION_COPY[outcome.gate_decision].tone}>
                      {DECISION_COPY[outcome.gate_decision].label}
                    </Badge>
                  ) : null}

                  <span className="ml-auto truncate text-ng-2xs text-ng-secondary">
                    {outcome
                      ? String(outcome.recovery?.next_step ?? "—").replace(/_/g, " ") +
                        (outcome.execution?.dispatch_status
                          ? ` · dispatch ${outcome.execution.dispatch_status}`
                          : "")
                      : active
                        ? "running…"
                        : "waiting"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {/* ── Results: only once the run has actually finished ────────────── */}
      {complete && finalState ? (
        <ResultsSection state={finalState} recommendation={recommendation} />
      ) : null}

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
