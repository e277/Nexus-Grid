import { useState } from "react";
import { api } from "../api";
import { DataTable } from "../components/DataTable";
import { FormError, SelectField, SubmitButton, TextField } from "../components/Fields";
import { Modal } from "../components/Modal";
import { Panel } from "../components/Panel";
import { StatTile } from "../components/StatTile";
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

type ModalKind = "customs" | "weather" | null;

export function GovernmentView() {
  const { data, error, refresh } = usePoll(loadGovernment);
  const [openModal, setOpenModal] = useState<ModalKind>(null);

  const [wType, setWType] = useState("storm");
  const [wSeverity, setWSeverity] = useState("medium");
  const [wIslands, setWIslands] = useState("");
  const [cShipmentId, setCShipmentId] = useState("");
  const [cDocType, setCDocType] = useState("");
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

  if (error) return <p className="rounded-md border border-ng-warning-bd bg-ng-warning-bg px-4 py-3 text-sm text-ng-warning-tx">Failed to load: {error}</p>;
  if (!data) return <p className="text-sm text-ng-secondary">Loading…</p>;

  const pendingCustoms = data.customs.filter((d) => d.status === "submitted");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Pending customs" value={pendingCustoms.length} hint="awaiting approval/rejection" />
        <StatTile label="Weather alerts" value={data.weather.length} />
        <StatTile label="Agent activity" value={data.activities.length} />
        <StatTile label="Audit entries" value={data.audits.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Customs queue" action={{ label: "+ Create document", onClick: () => setOpenModal("customs") }}>
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

        <Panel title="Weather alerts" action={{ label: "+ Issue alert", onClick: () => setOpenModal("weather") }}>
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
                  <span className="font-mono text-xs text-ng-secondary">{a.agent_name}</span>
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

      {openModal === "customs" ? (
        <Modal title="Create customs document" onClose={() => setOpenModal(null)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit(() =>
                api.createCustomsDocument({
                  shipment_id: Number(cShipmentId),
                  document_type: cDocType,
                  status: "draft" as never,
                })
              ).then(() => {
                setCShipmentId("");
                setCDocType("");
                setOpenModal(null);
              });
            }}
          >
            <TextField label="Shipment ID" value={cShipmentId} onChange={setCShipmentId} type="number" required />
            <TextField label="Document type" value={cDocType} onChange={setCDocType} required />
            <SubmitButton busy={busy}>Create document</SubmitButton>
          </form>
        </Modal>
      ) : null}

      {openModal === "weather" ? (
        <Modal title="Issue weather alert" onClose={() => setOpenModal(null)}>
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
              ).then(() => {
                setWIslands("");
                setOpenModal(null);
              });
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
        </Modal>
      ) : null}
    </div>
  );
}
