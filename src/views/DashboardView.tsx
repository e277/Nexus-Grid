"use client";

import { Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, streamWorkflow } from "../api";
import { DispatchPanel } from "../components/analysis/DispatchPanel";
import { ScanStatusPanel } from "../components/analysis/ScanStatusPanel";
import { AgentDecisionChart, GateOutcomeChart } from "../components/charts/AgentCharts";
import { FormError } from "../components/Fields";
import { ApprovalPanel, type HeldRecommendation } from "../components/pipeline/ApprovalPanel";
import { PipelineDiagram } from "../components/pipeline/PipelineDiagram";
import {
  buildInitialNodes,
  PIPELINE_NODES,
  summarizeUpdate,
  type NodeState,
} from "../components/pipeline/model";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { usePoll } from "../hooks";
import type { PageId } from "../navigation";
import type { GateDecision, Health, SubstitutionOpportunity } from "../types";

/**
 * Nodes with exactly one outgoing edge, so the graph's position is known the
 * moment the predecessor lands. `plan` and `monitor` are absent on purpose:
 * both branch, and until the next event arrives there is no honest answer to
 * where the run is.
 */
/**
 * Where the graph goes after a node finishes, so the diagram can mark the next
 * step as running before its event arrives.
 *
 * `plan` and `monitor` branch, and both branches are knowable: `plan` goes to
 * the gate when the operator armed it and straight to `execute` when they did
 * not, and `monitor` goes to `recover` unless it forces a re-plan, which it can
 * do at most once. Leaving them out meant the Execute and Recover phases never
 * showed as running at all — every node in them completes in about a
 * millisecond, so their only chance to appear active is the moment before.
 */
function successorOf(id: string, gated: boolean): string | undefined {
  switch (id) {
    case "perceive":
      return "assess";
    case "assess":
      return "recommend";
    case "recommend":
      return "plan";
    case "plan":
      return gated ? "hold" : "execute";
    case "hold":
      return "execute";
    case "execute":
      return "monitor";
    case "monitor":
      return "recover";
    default:
      return undefined;
  }
}

export interface ActingAgent {
  name: string;
  title: string;
  action: string;
  confidence: number;
  rationale: string;
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

export function DashboardView({
  health,
  onNavigate,
}: {
  health: Health | null;
  onNavigate: (page: PageId) => void;
}) {
  const [gaps, setGaps] = useState<SubstitutionOpportunity[]>([]);
  const [climateByIso3, setClimateByIso3] = useState<Record<string, string>>({});
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
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load the regional picture")
      );
  }, []);

  /** The sweep: every observed gap, run one after another. */
  const gapsRef = useRef<SubstitutionOpportunity[]>([]);
  const [queueIndex, setQueueIndex] = useState<number | null>(null);
  const [completed, setCompleted] = useState<{ gap: SubstitutionOpportunity; state: FinalState }[]>([]);
  /**
   * The gate is opt-in.
   *
   * A first run should complete without the reader having to know what the
   * gate is: pressing Run sweep and watching the loop finish is the shortest
   * path to understanding what this does. Ticking the box is then a
   * deliberate choice to see the one step that is not autonomous, which is
   * the right way round — the feature is worth more when someone went
   * looking for it than when it stops a run they did not expect to be
   * stopped.
   *
   * Note the consequence: with the gate off, an approved plan is dispatched
   * without a human answer, because there was no human in the loop to give
   * one. That is what the delivery panel above the checklist is for.
   */
  const [requireApproval, setRequireApproval] = useState(false);
  /**
   * Run a short sweep instead of the whole region.
   *
   * Every gap costs one model call of roughly twenty seconds, so twelve of them
   * is about four minutes — fine unattended, far too long to stand in front of.
   * This scopes the sweep to the three largest gaps, and scopes the checklist
   * and the counter with it, so the card never claims a total it is not going
   * to run.
   */
  const [demoMode, setDemoMode] = useState(false);
  const [nodes, setNodes] = useState<Record<string, NodeState>>(buildInitialNodes());
  /**
   * Which specialist acted at each step, as each step reports.
   *
   * Read from the run rather than assumed: a node names its agent only once
   * that agent has actually answered, so a step that ran without one — the
   * model call, the dispatch — stays unattributed instead of borrowing a name.
   */
  const [agentByNode, setAgentByNode] = useState<Record<string, ActingAgent>>({});
  /**
   * What this cycle recorded, cleared when the next one starts.
   *
   * Deliberately not the all-time activity log. That accumulates across every
   * scan the runtime has ever done, so the chart answered "how busy has this
   * process been" when the question in front of an operator is "what did the
   * sweep I just ran decide". One sweep, one reading.
   */
  const [cycleAgents, setCycleAgents] = useState<{ agent: string; confidence: number | null }[]>([]);
  const [cycleGates, setCycleGates] = useState<{ decision: string }[]>([]);
  const [trace, setTrace] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [interruptPayload, setInterruptPayload] = useState<Record<string, unknown> | null>(null);
  const [recommendation, setRecommendation] = useState<unknown>(null);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Polled here for one thing only: whether an approved plan has anywhere to
   * go. The conclusions themselves belong to the Intelligence pages and to
   * Impact Metrics; what this page needs from them is the delivery status,
   * which has to be legible at the gate rather than a page away.
   */
  const { data: analysis } = usePoll(() => api.analysisOverview(), 30_000);

  // The autonomous scan's own heartbeat, independent of whatever sweep is
  // (or isn't) running below — see ScanStatusPanel for why this exists.
  const { data: lastScans } = usePoll(
    () => api.agentActivities({ agent_name: "supply_intelligence", limit: 1 }),
    15_000
  );

  /**
   * A short sweep runs Jamaica's largest gap, and only that.
   *
   * One gap rather than three: each costs a model call of roughly twenty
   * seconds, so one finishes while someone is still watching it. Jamaica
   * because it is a named member state a reader can hold in mind, rather than
   * whichever gap happens to sort first today.
   *
   * Falls back to the largest gap overall if Jamaica has none in the current
   * trade year. Showing nothing would leave the button inert with no
   * explanation, and the checklist names whichever gap it picked either way.
   */
  const jamaicaGaps = gaps.filter((gap) => gap.importer === "Jamaica");
  const sweepGaps = demoMode ? (jamaicaGaps.length > 0 ? jamaicaGaps : gaps).slice(0, 1) : gaps;

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
   * went. The alternative is guessing, and a diagram that guesses is
   * decoration.
   */
  async function consume(body: Record<string, unknown>, signal: AbortSignal) {
    // The `finished` event's own `data.value` carries only
    // `{ thread_id, status, interrupt }` — never the graph's channel state —
    // so the execute node's own update is the only place its dispatch outcome
    // actually appears in the stream. A disruption can send the run through
    // `execute` twice (the capped re-plan loop); the later one is the real
    // outcome, so each new one simply overwrites the last.
    let executionResult: FinalState["execution"] | undefined;

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
          const successor = successorOf(id, requireApproval);
          if (successor && next[successor]?.status !== "done") {
            next[successor] = { ...next[successor], status: "running" };
          }
          return next;
        });

        const acting = (update as { acting_agent?: ActingAgent }).acting_agent;
        if (acting) {
          setAgentByNode((prev) => ({ ...prev, [id]: acting }));
          setCycleAgents((prev) => [...prev, { agent: acting.title, confidence: acting.confidence }]);
        }

        if (id === "recommend") setRecommendation(update.recommendation);
        if (id === "execute") executionResult = update.execution as FinalState["execution"];
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
          continue;
        }
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
          const current = gapsRef.current[index];
          const state = { ...(data.value ?? {}), execution: executionResult } as FinalState;
          setCompleted((done) => [...done, { gap: current, state }]);
          void runFrom(index + 1);
          return index;
        });
        continue;
      }

      if (event === "failed") {
        setRunning(false);
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
   * Sequential, and the gate is why it has to be: a gap that reaches the gate
   * stops the queue where it is, because the point of the gate is that a human
   * decides before anything downstream happens. `decide()` restarts the queue
   * at the next gap.
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
    setNodes(buildInitialNodes());
    setAgentByNode({});
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
   * Start the sweep at the first gap.
   *
   * One at a time, whether or not the gate is armed. Running them at once was
   * measurably faster — the source cache de-duplicates in flight, so twelve
   * concurrent runs cause one fetch per publisher rather than twelve — but it
   * bought that with a console nobody could follow: one diagram cannot show
   * twelve traversals, so eleven of the runs happened somewhere off screen.
   *
   * A sweep an operator can watch is worth more here than a sweep that
   * finishes sooner, and the sequential path is the one the approval gate
   * needs anyway. `runFrom` and `decide` carry it from there.
   */
  function runAll() {
    if (running || sweepGaps.length === 0) return;
    gapsRef.current = sweepGaps;
    setCompleted([]);
    setRunError(null);
    // A new cycle starts from nothing: these describe this sweep, not the
    // history of the process.
    setCycleAgents([]);
    setCycleGates([]);
    void runFrom(0);
  }

  async function decide(decision: GateDecision, note: string | null) {
    if (!threadId) return;
    setCycleGates((prev) => [...prev, { decision }]);
    const controller = new AbortController();
    abortRef.current = controller;

    setResuming(true);
    setRunError(null);
    setAwaitingApproval(false);
    setInterruptPayload(null);
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

  // The most recent completed gap's actual dispatch outcome — not whether
  // the gateway happens to be configured, but what happened when this
  // specific plan tried to reach it. Nothing to show before the first one.
  const lastCompleted = completed.length > 0 ? completed[completed.length - 1] : null;
  const lastDispatch = lastCompleted?.state.execution?.dispatch_status
    ? {
        gapLabel: `${lastCompleted.gap.importer} · ${lastCompleted.gap.commodity}`,
        status: lastCompleted.state.execution.dispatch_status,
        target: lastCompleted.state.execution.dispatch_target,
        detail: lastCompleted.state.execution.dispatch_detail,
      }
    : null;

  return (
    <div className="space-y-4">

      {loadError ? <FormError message={loadError} /> : null}
      {runError ? <FormError message={runError} /> : null}

      {/* One card: the autonomous loop's own status (top, unconditional —
          it runs whether or not anyone is watching) and the manual sweep's
          run control (bottom) — two different mechanisms, not two cards.
          No per-gap checklist in the control row — gaps carry no honest
          per-domain classification (every domain's analysis reads the same
          full list; see DOMAIN_BRIEF in analysis.ts), so there is nowhere
          else to move it to. A swept gap's outcome still shows up in the
          decision charts below and in Visibility's audit trail. */}
      <Card className="overflow-hidden p-0 divide-y divide-ng-border">
        <ScanStatusPanel
          health={health}
          lastScan={lastScans?.[0] ?? null}
          analyses={analysis?.analyses}
          onNavigate={onNavigate}
        />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-ng-base font-semibold text-ng-primary">Coordination sweep</h2>
            <p className="mt-0.5 text-ng-2xs text-ng-secondary">
              {gaps.length === 0
                ? "Loading live trade data…"
                : `${done.size} of ${sweepGaps.length} sourcing gap${sweepGaps.length === 1 ? "" : "s"} swept${
                    demoMode ? ` · ${gaps.length} found` : ""
                  }`}
            </p>
          </div>

          <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-ng-muted sm:w-32">
            <span
              className="block h-full rounded-full bg-ng-accent transition-[width] duration-300"
              style={{ width: `${(done.size / Math.max(1, sweepGaps.length)) * 100}%` }}
            />
          </span>

          <label className="ml-auto flex shrink-0 items-center gap-2 text-ng-xs text-ng-secondary">
            <input
              type="checkbox"
              checked={requireApproval}
              disabled={running || awaitingApproval}
              onChange={(e) => setRequireApproval(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-ng-border text-ng-accent focus:ring-ng-accent"
            />
            Gate urgent plans
          </label>

          {/* Named for what it is. A sweep that silently ran three of twelve
              would be a demo lying about its own scope. */}
          <label className="flex shrink-0 items-center gap-2 text-ng-xs text-ng-secondary">
            <input
              type="checkbox"
              checked={demoMode}
              disabled={running || awaitingApproval}
              onChange={(e) => setDemoMode(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-ng-border text-ng-accent focus:ring-ng-accent"
            />
            Short sweep
            <span className="hidden text-ng-2xs text-ng-disabled xl:inline">
              · Jamaica only
            </span>
          </label>

          <Button
            onClick={runAll}
            disabled={running || awaitingApproval || sweepGaps.length === 0}
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
        </div>
      </Card>

      {/* ── The loop ────────────────────────────────────────────────────── */}
      <Card className="p-3 sm:p-4">
        <PipelineDiagram
          nodes={nodes}
          trace={trace}
          focus={null}
          awaitingApproval={awaitingApproval}
          modelSource={modelSource === "minimax" ? "MiniMax" : modelSource ? "Rule-based" : null}
          agentByNode={agentByNode}
          // Which gap this traversal belongs to. Without it the diagram and
          // the checklist are two views of a sweep with nothing tying them
          // together, and a reader cannot tell which run they are watching.
          subject={
            queueIndex !== null && sweepGaps[queueIndex]
              ? {
                  label: `${sweepGaps[queueIndex].importer} · ${sweepGaps[queueIndex].commodity}`,
                  position: queueIndex + 1,
                  total: sweepGaps.length,
                }
              : null
          }
        />
      </Card>

      {/* ── The gate ────────────────────────────────────────────────────
             Always on screen, inert until a run parks here. A control that
             appears and vanishes reads as incidental, and this is the one
             point in the loop where a run is not autonomous.

             Its own heading and the held plan's priority badge say the run
             has parked, so nothing above repeats it. */}
      <ApprovalPanel
        recommendation={held}
        onDecide={decide}
        busy={resuming}
        active={awaitingApproval && held !== null}
        gateEnabled={requireApproval}
      />

      {/* Beside the gate, not filed under the analysis: what happened when the
          last completed plan tried to reach an operator has to be legible at
          the moment of the decision, not buried in a finished run's detail.
          Absent until a plan has actually gone through execute. */}
      {lastDispatch ? <DispatchPanel {...lastDispatch} /> : null}

      {/* ── What the loop has decided, across every run ──────────────────
             These are the loop's own records — what each agent decided and
             how humans answered at the gate — so they belong beside the loop
             rather than on a separate analysis page. They accumulate across
             runs, which is why they are here rather than inside a single
             run's outcome. */}
      {cycleAgents.length > 0 || cycleGates.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AgentDecisionChart decisions={cycleAgents} />
          <GateOutcomeChart gateDecisions={cycleGates} />
        </div>
      ) : null}

    </div>
  );
}

