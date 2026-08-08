import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { CheckboxField, FormError, SelectField, SubmitButton, TextField } from "../components/Fields";
import { Panel } from "../components/Panel";
import { RecommendationCard } from "../components/RecommendationCard";
import {
  buildInitialNodes,
  PIPELINE_NODES,
  summarizeUpdate,
  WorkflowPipeline,
  type NodeState,
} from "../components/WorkflowPipeline";
import type { Crop, Farmer, WorkflowResult } from "../types";

// Half the per-node reveal time: each node pulses "running" for this long,
// then flips to "done" and holds before the next node starts.
const STEP_MS = 260;

interface Scenario {
  key: string;
  label: string;
  crop_id: number;
  crop_name: string;
  quantity: number;
  farmer_id: number;
  farmer_name: string;
  island: string;
}

export function WorkflowView() {
  const [crops, setCrops] = useState<Crop[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.crops({ limit: 50 }), api.farmers({ limit: 50 })])
      .then(([c, f]) => {
        setCrops(c);
        setFarmers(f);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load seed data"));
  }, []);

  const scenarios: Scenario[] = crops.map((c) => {
    const farmer = farmers.find((f) => f.id === c.farmer_id);
    return {
      key: String(c.id),
      label: `${c.crop_name} — ${farmer?.name ?? "unknown farmer"} · ${farmer?.island ?? "—"} · ${c.quantity} units`,
      crop_id: c.id,
      crop_name: c.crop_name,
      quantity: c.quantity,
      farmer_id: c.farmer_id,
      farmer_name: farmer?.name ?? "unknown farmer",
      island: farmer?.island ?? "unknown island",
    };
  });

  const [scenarioKey, setScenarioKey] = useState("");
  const [quantity, setQuantity] = useState("");
  const [event, setEvent] = useState("shortage");
  const [weatherRisk, setWeatherRisk] = useState("low");
  const [logisticsStatus, setLogisticsStatus] = useState("available");
  const [requireApproval, setRequireApproval] = useState(false);

  useEffect(() => {
    if (scenarios.length && !scenarioKey) {
      setScenarioKey(scenarios[0].key);
      setQuantity(String(scenarios[0].quantity));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crops, farmers]);

  const selected = scenarios.find((s) => s.key === scenarioKey) ?? null;

  const [nodes, setNodes] = useState<Record<string, NodeState>>(buildInitialNodes());
  const [running, setRunning] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [interruptPayload, setInterruptPayload] = useState<Record<string, unknown> | null>(null);
  const [recommendation, setRecommendation] = useState<unknown>(null);
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
      setNodes((prev) => ({ ...prev, [step.id]: { ...prev[step.id], status: "running" } }));
      timerRef.current = window.setTimeout(() => {
        setNodes((prev) => ({
          ...prev,
          [step.id]: { ...prev[step.id], status: "done", summary: summarizeUpdate(step.id, step.data) },
        }));
        if (step.id === "recommend") setRecommendation(step.data.recommendation);
        timerRef.current = window.setTimeout(() => revealStep(index + 1), STEP_MS);
      }, STEP_MS);
    }

    revealStep(0);
  }

  function finishRun(result: WorkflowResult) {
    setRunning(false);
    const finalState = result.result.values.at(-1) as
      | {
          decision?: string;
          execution?: { status?: string };
          recovery?: { recovery_action?: string; next_step?: string };
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

    try {
      const result = await api.triggerWorkflow({
        crop_id: selected.crop_id,
        crop_name: selected.crop_name,
        farmer_id: selected.farmer_id,
        farmer_name: selected.farmer_name,
        island: selected.island,
        quantity: Number(quantity) || selected.quantity,
        event,
        weather_risk: weatherRisk,
        logistics_status: logisticsStatus,
        require_approval: requireApproval,
      });
      handleResult(result);
    } catch (err) {
      setRunning(false);
      setRunError(err instanceof Error ? err.message : "Workflow trigger failed");
    }
  }

  /** A human decides at the approval gate — this is the only point a run
   * doesn't proceed autonomously; everything else runs end to end on its own. */
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
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <Panel title="Run a scenario" subtitle="Crop lots sourced from demo_seed.py">
        {loadError ? <FormError message={loadError} /> : null}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <SelectField
            label="Crop lot"
            value={scenarioKey}
            onChange={(v) => {
              setScenarioKey(v);
              const s = scenarios.find((sc) => sc.key === v);
              if (s) setQuantity(String(s.quantity));
            }}
            options={scenarios.map((s) => ({ value: s.key, label: s.label }))}
          />
          <TextField label="Quantity" value={quantity} onChange={setQuantity} type="number" required />
          <SelectField
            label="Event"
            value={event}
            onChange={setEvent}
            options={["surplus", "shortage", "inventory_checked"].map((v) => ({ value: v, label: v }))}
          />
          <SelectField
            label="Weather risk"
            value={weatherRisk}
            onChange={setWeatherRisk}
            options={["low", "medium", "high", "severe"].map((v) => ({ value: v, label: v }))}
          />
          <SelectField
            label="Logistics status"
            value={logisticsStatus}
            onChange={setLogisticsStatus}
            options={["available", "constrained"].map((v) => ({ value: v, label: v }))}
          />
          <CheckboxField
            label="Require approval for urgent plans"
            checked={requireApproval}
            onChange={setRequireApproval}
            hint="High/urgent plans genuinely pause here until approved or rejected"
          />
          <SubmitButton busy={running || awaitingApproval}>Run workflow</SubmitButton>
          <FormError message={runError} />
        </form>
      </Panel>

      <Panel
        title="Pipeline"
        subtitle="perceive → assess → recommend → plan → execute/hold → monitor → recover — runs autonomously except where it pauses below"
        noPad
      >
        <div className="p-5">
          <WorkflowPipeline nodes={nodes} />

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
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={resuming}
                  onClick={() => decide("approved")}
                  className="rounded-md bg-ng-success px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {resuming ? "Working…" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={resuming}
                  onClick={() => decide("rejected")}
                  className="rounded-md border border-ng-danger-bd bg-ng-surface px-3 py-1.5 text-sm font-semibold text-ng-danger-tx transition-colors hover:bg-ng-danger-bg disabled:opacity-50"
                >
                  {resuming ? "Working…" : "Reject"}
                </button>
              </div>
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
