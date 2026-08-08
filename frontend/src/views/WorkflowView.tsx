import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { CheckboxField, FormError, SelectField, SubmitButton, TextField } from "../components/Fields";
import { Panel } from "../components/Panel";
import {
  buildInitialNodes,
  PIPELINE_NODES,
  summarizeUpdate,
  WorkflowPipeline,
  type NodeState,
} from "../components/WorkflowPipeline";
import type { Crop, Farmer } from "../types";

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
  const [runError, setRunError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    []
  );

  async function run() {
    if (!selected || running) return;
    setRunning(true);
    setRunError(null);
    setSummary(null);
    setNodes(buildInitialNodes());

    let result;
    try {
      result = await api.triggerWorkflow({
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
    } catch (err) {
      setRunning(false);
      setRunError(err instanceof Error ? err.message : "Workflow trigger failed");
      return;
    }

    const steps = result.result.updates
      .map((entry) => {
        const [id] = Object.keys(entry);
        return { id, data: entry[id] };
      })
      .filter((s) => PIPELINE_NODES.some((n) => n.id === s.id));

    const finalStatus = result.result.status;

    function finish() {
      setRunning(false);
      const finalState = result!.result.values.at(-1) as
        | {
            decision?: string;
            execution?: { status?: string };
            recovery?: { recovery_action?: string; next_step?: string };
          }
        | undefined;
      setSummary(
        `Run ${finalStatus} · decision: ${finalState?.decision ?? "—"} · execution: ${
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

    function revealStep(index: number) {
      if (index >= steps.length) {
        finish();
        return;
      }
      const step = steps[index];
      setNodes((prev) => ({ ...prev, [step.id]: { ...prev[step.id], status: "running" } }));
      timerRef.current = window.setTimeout(() => {
        setNodes((prev) => ({
          ...prev,
          [step.id]: { ...prev[step.id], status: "done", summary: summarizeUpdate(step.id, step.data) },
        }));
        timerRef.current = window.setTimeout(() => revealStep(index + 1), STEP_MS);
      }, STEP_MS);
    }

    revealStep(0);
  }

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
            hint="High/urgent plans hold at the approval gate instead of executing"
          />
          <SubmitButton busy={running}>Run workflow</SubmitButton>
          <FormError message={runError} />
        </form>
      </Panel>

      <Panel
        title="Pipeline"
        subtitle="perceive → assess → recommend → plan → execute/hold → monitor → recover"
        noPad
      >
        <div className="p-5">
          <WorkflowPipeline nodes={nodes} />
          {summary ? (
            <p className="mt-4 rounded-md border border-ng-border bg-ng-bg px-3 py-2 text-sm text-ng-primary">
              {summary}
            </p>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
