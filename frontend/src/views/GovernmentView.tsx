import { useState } from "react";
import { api } from "../api";
import { DataTable } from "../components/DataTable";
import { FormError, SelectField, SubmitButton, TextField } from "../components/Fields";
import { Panel } from "../components/Panel";
import { StatusActions } from "../components/StatusActions";
import { StatusPill } from "../components/StatusPill";
import { usePoll } from "../hooks";

// Government drives submitted -> approved/rejected (filing is logistics' job)
const CUSTOMS_TRANSITIONS: Record<string, string[]> = {
  draft: [],
  submitted: ["approved", "rejected"],
  approved: [],
  rejected: [],
};

async function loadGovernment() {
  const [weather, customs, activities, audits] = await Promise.all([
    api.weatherEvents(),
    api.customsDocuments(),
    api.agentActivities(),
    api.auditLogs(),
  ]);
  return { weather, customs, activities, audits };
}

export function GovernmentView() {
  const { data, error, refresh } = usePoll(loadGovernment);

  const [wType, setWType] = useState("storm");
  const [wSeverity, setWSeverity] = useState("medium");
  const [wIslands, setWIslands] = useState("");
  const [wfCrop, setWfCrop] = useState("");
  const [wfQty, setWfQty] = useState("");
  const [wfEvent, setWfEvent] = useState("surplus");
  const [wfResult, setWfResult] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(action: () => Promise<unknown>) {
    setBusy(true);
    setFormError(null);
    try {
      await action();
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-amber-800">Failed to load: {error}</p>;
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Customs queue">
        <DataTable
          rows={data.customs}
          rowKey={(d) => d.id}
          empty="No customs documents."
          columns={[
            { label: "Doc", render: (d) => `#${d.id} · ${d.document_type}` },
            { label: "Shipment", render: (d) => d.shipment_id, numeric: true },
            { label: "Status", render: (d) => <StatusPill value={d.status} /> },
            {
              label: "Decision",
              render: (d) => (
                <StatusActions
                  current={d.status}
                  transitions={CUSTOMS_TRANSITIONS}
                  busy={busy}
                  onSelect={(next) =>
                    submit(() => api.setCustomsStatus(d.id, next as never))
                  }
                />
              ),
            },
          ]}
        />
        <FormError message={formError} />
      </Panel>

      <Panel title="Issue weather alert">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(() =>
              api.createWeatherEvent({
                event_type: wType,
                severity: wSeverity as never,
                affected_islands: wIslands || null,
              })
            ).then(() => setWIslands(""));
          }}
        >
          <SelectField
            label="Event type"
            value={wType}
            onChange={setWType}
            options={["storm", "hurricane", "flood", "drought"].map((v) => ({
              value: v,
              label: v,
            }))}
          />
          <SelectField
            label="Severity"
            value={wSeverity}
            onChange={setWSeverity}
            options={["low", "medium", "high", "severe"].map((v) => ({
              value: v,
              label: v,
            }))}
          />
          <TextField
            label="Affected islands (comma-separated)"
            value={wIslands}
            onChange={setWIslands}
          />
          <SubmitButton busy={busy}>Publish alert</SubmitButton>
        </form>
        <div className="mt-6">
          <DataTable
            rows={data.weather}
            rowKey={(w) => w.id}
            empty="No weather events."
            limit={5}
            columns={[
              { label: "Event", render: (w) => w.event_type },
              { label: "Islands", render: (w) => w.affected_islands ?? "region-wide" },
              { label: "Severity", render: (w) => <StatusPill value={w.severity} /> },
            ]}
          />
        </div>
      </Panel>

      <Panel title="Trigger orchestration workflow">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setWfResult(null);
            submit(async () => {
              const result = await api.triggerWorkflow({
                crop_name: wfCrop,
                quantity: Number(wfQty),
                event: wfEvent,
              });
              const final = result.result.values.at(-1) as
                | { execution?: { status?: string }; decision?: string }
                | undefined;
              setWfResult(
                `Run ${result.result.status} · decision: ${final?.decision ?? "—"} · execution: ${final?.execution?.status ?? "—"}`
              );
            });
          }}
        >
          <TextField label="Crop" value={wfCrop} onChange={setWfCrop} required />
          <TextField label="Quantity" value={wfQty} onChange={setWfQty} type="number" required />
          <SelectField
            label="Event"
            value={wfEvent}
            onChange={setWfEvent}
            options={["surplus", "shortage", "inventory_checked"].map((v) => ({
              value: v,
              label: v,
            }))}
          />
          <SubmitButton busy={busy}>Run workflow</SubmitButton>
          {wfResult ? (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {wfResult}
            </p>
          ) : null}
        </form>
      </Panel>

      <Panel title="Agent activity">
        <DataTable
          rows={data.activities}
          rowKey={(a) => a.id}
          empty="No agent decisions recorded yet."
          columns={[
            {
              label: "Agent",
              render: (a) => (
                <span className="font-mono text-xs text-slate-600">{a.agent_name}</span>
              ),
            },
            { label: "Action", render: (a) => a.action },
            {
              label: "Confidence",
              render: (a) =>
                a.confidence != null ? `${Math.round(a.confidence * 100)}%` : "—",
              numeric: true,
            },
          ]}
        />
      </Panel>

      <Panel title="Audit trail">
        <DataTable
          rows={data.audits}
          rowKey={(a) => a.id}
          empty="No audit entries."
          columns={[
            { label: "Actor", render: (a) => a.actor },
            { label: "Action", render: (a) => a.action },
            {
              label: "Entity",
              render: (a) =>
                a.entity_type ? `${a.entity_type} #${a.entity_id ?? "?"}` : "—",
            },
          ]}
        />
      </Panel>
    </div>
  );
}
