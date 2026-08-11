import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { CheckboxField, FormError, SelectField, SubmitButton } from "../components/Fields";
import { AgentGraph } from "../components/AgentGraph";
import { Panel } from "../components/Panel";
import { Button } from "../components/ui/button";
import { RecommendationCard } from "../components/RecommendationCard";
import {
  buildInitialNodes,
  PIPELINE_NODES,
  summarizeUpdate,
  WorkflowPipeline,
  type NodeState,
} from "../components/WorkflowPipeline";
import type { SourceProvenance, SubstitutionOpportunity, WorkflowResult } from "../types";

// How long a node pulses "running" before flipping to "done".
const RUN_MS = 550;
// Pause after a node completes, before the next one starts running —
// the visible gap between steps.
const GAP_MS = 700;

function usd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

export function WorkflowView() {
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
          Object.fromEntries(
            data.picture.states.map((s) => [s.iso3, s.climate_risk ?? "low"])
          )
        );
        setSources(data.sources);
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load the regional picture")
      );
  }, []);

  const [gapKey, setGapKey] = useState("");
  const [requireApproval, setRequireApproval] = useState(true);

  useEffect(() => {
    if (gaps.length && !gapKey) setGapKey(`${gaps[0].importer_iso3}-${gaps[0].commodity_code}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gaps]);

  const selected =
    gaps.find((g) => `${g.importer_iso3}-${g.commodity_code}` === gapKey) ?? null;

  const [nodes, setNodes] = useState<Record<string, NodeState>>(buildInitialNodes());
  const [running, setRunning] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [interruptPayload, setInterruptPayload] = useState<Record<string, unknown> | null>(null);
  const [recommendation, setRecommendation] = useState<unknown>(null);
  const [trace, setTrace] = useState<string[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    []
  );

  /** Reveal each `updates` node in sequence (running -> done), then call `onSettled`. */
  function revealAndSettle(result: WorkflowResult, onSettled: () => void) {
    const steps = result.result.updates
      .map((entry) => {
        const [id] = Object.keys(entry);
        return { id, data: entry[id] };
      })
      .filter((s) => PIPELINE_NODES.some((n) => n.id === s.id));

    function revealStep(index: number) {
      if (index >= steps.length) {
        onSettled();
        return;
      }
      const step = steps[index];
      setTrace((prev) => [...prev, step.id]);
      setNodes((prev) => ({ ...prev, [step.id]: { ...prev[step.id], status: "running" } }));
      timerRef.current = window.setTimeout(() => {
        setNodes((prev) => ({
          ...prev,
          [step.id]: { ...prev[step.id], status: "done", summary: summarizeUpdate(step.id, step.data) },
        }));
        if (step.id === "recommend") setRecommendation(step.data.recommendation);
        timerRef.current = window.setTimeout(() => revealStep(index + 1), GAP_MS);
      }, RUN_MS);
    }

    revealStep(0);
  }

  function finishRun(result: WorkflowResult) {
    setRunning(false);
    const finalState = result.result.values.at(-1) as
      | {
          decision?: string;
          execution?: { status?: string };
          recovery?: { recovery_action?: string };
        }
      | undefined;
    setSummary(
      `Run ${result.result.status} · decision: ${finalState?.decision ?? "—"} · execution: ${
        finalState?.execution?.status ?? "—"
      } · follow-up: ${finalState?.recovery?.recovery_action ?? "—"}`
    );
    setNodes((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key].status === "pending") next[key] = { ...next[key], status: "skipped" };
      }
      return next;
    });
  }

  /** After revealing this result's steps, either pause for a human decision or wrap up. */
  function handleResult(result: WorkflowResult) {
    setThreadId(result.result.thread_id);
    revealAndSettle(result, () => {
      if (result.result.status === "awaiting_approval") {
        setRunning(false);
        setAwaitingApproval(true);
        setInterruptPayload(result.result.interrupt ?? null);
        // The graph is genuinely paused inside `hold` — reflect that visually
        // rather than leaving it looking untouched ("pending").
        setNodes((prev) => ({ ...prev, hold: { ...prev.hold, status: "running" } }));
      } else {
        finishRun(result);
      }
    });
  }

  async function run() {
    if (!selected || running) return;
    setRunning(true);
    setRunError(null);
    setSummary(null);
    setAwaitingApproval(false);
    setInterruptPayload(null);
    setThreadId(null);
    setRecommendation(null);
    setNodes(buildInitialNodes());
    setTrace([]);

    try {
      const result = await api.triggerWorkflow({
        event: "substitution_gap",
        commodity: selected.commodity,
        importer: selected.importer,
        importer_iso3: selected.importer_iso3,
        external_usd: selected.external_usd,
        external_share_pct: Math.round(selected.external_share_pct),
        regional_suppliers: selected.regional_suppliers,
        climate_risk: climateByIso3[selected.importer_iso3] ?? "low",
        require_approval: requireApproval,
      });
      handleResult(result);
    } catch (err) {
      setRunning(false);
      setRunError(err instanceof Error ? err.message : "Workflow trigger failed");
    }
  }

  /** A human decides at the approval gate — the only point a run doesn't
   * proceed autonomously; everything else runs end to end on its own. */
  async function decide(decision: "approved" | "rejected") {
    if (!threadId) return;
    setResuming(true);
    setRunError(null);
    try {
      const resumed = await api.resumeWorkflow(threadId, decision);
      setAwaitingApproval(false);
      setInterruptPayload(null);
      setRunning(true);
      handleResult(resumed);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Resume failed");
    } finally {
      setResuming(false);
    }
  }

  const heldTask = interruptPayload?.execution as
    | { task?: string; details?: { priority?: string; target?: string; strategy?: string } }
    | undefined;

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Panel
        title="Run a coordination cycle"
        subtitle="Sourcing gaps observed in live trade data"
      >
        {loadError ? <FormError message={loadError} /> : null}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <SelectField
            label="Sourcing gap"
            value={gapKey}
            onChange={setGapKey}
            options={gaps.map((g) => ({
              value: `${g.importer_iso3}-${g.commodity_code}`,
              label: `${g.importer} · ${g.commodity} · ${usd(g.external_usd)} external (${g.external_share_pct}%)`,
            }))}
          />

          {selected ? (
            <div className="rounded-md border border-ng-border bg-ng-well px-3 py-2.5 text-[12px] leading-relaxed text-ng-secondary">
              <p>
                <span className="font-semibold text-ng-primary">{selected.importer}</span> buys{" "}
                {usd(selected.external_usd)} of {selected.commodity.toLowerCase()} outside CARICOM (
                {selected.external_share_pct}% of its imports of that commodity).
              </p>
              <p className="mt-1">
                Already supplied into the region by{" "}
                {selected.regional_suppliers.slice(0, 3).join(", ") || "no member state"}.
              </p>
            </div>
          ) : null}

          <CheckboxField
            label="Require approval for urgent plans"
            checked={requireApproval}
            onChange={setRequireApproval}
            hint="High/urgent plans genuinely pause here until approved or rejected"
          />
          <SubmitButton busy={running || awaitingApproval}>Run coordination cycle</SubmitButton>

          {/* The gate lives beside the trigger and is always visible, disabled
              until a run actually pauses. Buttons that appear and vanish make
              the gate look incidental; it is the one point a run is not
              autonomous, so it should be visibly part of the control. */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="success"
              size="sm"
              className="flex-1"
              disabled={!awaitingApproval || resuming}
              onClick={() => decide("approved")}
            >
              {resuming ? "Working…" : "Approve"}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="flex-1"
              disabled={!awaitingApproval || resuming}
              onClick={() => decide("rejected")}
            >
              {resuming ? "Working…" : "Reject"}
            </Button>
          </div>
          <p className="text-ng-2xs leading-snug text-ng-secondary">
            {awaitingApproval
              ? `Paused at the gate — ${heldTask?.task ?? "action"}, priority ${
                  heldTask?.details?.priority ?? "—"
                }, target ${heldTask?.details?.target ?? "—"}.`
              : "Enabled only while a run is paused at the approval gate."}
          </p>

          <FormError message={runError} />
        </form>
      </Panel>

      <Panel
        title="Pipeline"
        subtitle="perceive → assess → recommend → plan → execute/hold → monitor → recover — runs autonomously except where it pauses below"
        noPad
      >
        <div className="p-5">
          <AgentGraph nodes={nodes} trace={trace} />

          <div className="mt-4 border-t border-ng-border pt-4">
            <WorkflowPipeline nodes={nodes} sources={sources} />
          </div>

          {recommendation ? (
            <div className="mt-4">
              <RecommendationCard recommendation={recommendation} />
            </div>
          ) : null}

          {awaitingApproval ? (
            <div className="mt-4 rounded-md border border-ng-warning-bd bg-ng-warning-bg p-4">
              <p className="text-sm font-semibold text-ng-warning-tx">
                Paused for approval — a human is required here
              </p>
              <p className="mt-1 text-sm text-ng-warning-tx">
                {heldTask?.task ?? "action"} · priority {heldTask?.details?.priority ?? "—"} · target{" "}
                {heldTask?.details?.target ?? "—"}
              </p>
              {heldTask?.details?.strategy ? (
                <p className="mt-1 text-xs text-ng-warning-tx">{heldTask.details.strategy}</p>
              ) : null}
              <p className="mt-2 text-xs text-ng-warning-tx">
                Approve or reject beside the run control to continue.
              </p>
            </div>
          ) : null}

          {summary ? (
            <p className="mt-4 rounded-md border border-ng-border bg-ng-well px-3 py-2 text-sm text-ng-primary">
              {summary}
            </p>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
