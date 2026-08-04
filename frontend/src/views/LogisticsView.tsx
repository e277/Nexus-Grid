import { useState } from "react";
import { api } from "../api";
import { DataTable } from "../components/DataTable";
import { FormError, SelectField, SubmitButton, TextField } from "../components/Fields";
import { Panel } from "../components/Panel";
import { StatusActions } from "../components/StatusActions";
import { StatusPill } from "../components/StatusPill";
import { usePoll } from "../hooks";

// Mirrors the backend transition maps
const SHIPMENT_TRANSITIONS: Record<string, string[]> = {
  planned: ["in_transit", "cancelled"],
  in_transit: ["delayed", "delivered", "cancelled"],
  delayed: ["in_transit", "delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};
const PORT_TRANSITIONS: Record<string, string[]> = {
  open: ["congested", "closed"],
  congested: ["open", "closed"],
  closed: ["open", "congested"],
};

async function loadLogistics() {
  const [shipments, carriers, warehouses, ports, routes] = await Promise.all([
    api.shipments(),
    api.carriers(),
    api.warehouses(),
    api.ports(),
    api.tradeRoutes(),
  ]);
  return { shipments, carriers, warehouses, ports, routes };
}

export function LogisticsView() {
  const { data, error, refresh } = usePoll(loadLogistics);

  const [sCropId, setSCropId] = useState("");
  const [sOrigin, setSOrigin] = useState("");
  const [sDest, setSDest] = useState("");
  const [sQty, setSQty] = useState("");
  const [sCarrier, setSCarrier] = useState("");
  const [pName, setPName] = useState("");
  const [pIsland, setPIsland] = useState("");
  const [pType, setPType] = useState("sea");
  const [caName, setCaName] = useState("");
  const [caMode, setCaMode] = useState("sea");
  const [caCapacity, setCaCapacity] = useState("");
  const [delayOrigin, setDelayOrigin] = useState("");
  const [delayDest, setDelayDest] = useState("");
  const [delay, setDelay] = useState<Record<string, unknown> | null>(null);
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
      <Panel title="Shipments">
        <DataTable
          rows={data.shipments}
          rowKey={(s) => s.id}
          columns={[
            { label: "Lane", render: (s) => `${s.origin_island} → ${s.destination_island}` },
            { label: "Qty", render: (s) => s.quantity.toLocaleString(), numeric: true },
            { label: "Status", render: (s) => <StatusPill value={s.status} /> },
            {
              label: "Actions",
              render: (s) => (
                <StatusActions
                  current={s.status}
                  transitions={SHIPMENT_TRANSITIONS}
                  busy={busy}
                  onSelect={(next) =>
                    submit(() => api.setShipmentStatus(s.id, next as never))
                  }
                />
              ),
            },
          ]}
        />
        <FormError message={formError} />
      </Panel>

      <Panel title="Book shipment">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(() =>
              api.createShipment({
                crop_id: Number(sCropId),
                origin_island: sOrigin,
                destination_island: sDest,
                quantity: Number(sQty),
                carrier: sCarrier || null,
              })
            );
          }}
        >
          <TextField label="Crop ID" value={sCropId} onChange={setSCropId} type="number" required />
          <TextField label="Origin island" value={sOrigin} onChange={setSOrigin} required />
          <TextField label="Destination island" value={sDest} onChange={setSDest} required />
          <TextField label="Quantity" value={sQty} onChange={setSQty} type="number" required />
          <TextField label="Carrier" value={sCarrier} onChange={setSCarrier} />
          <SubmitButton busy={busy}>Book</SubmitButton>
        </form>
      </Panel>

      <Panel title="Ports">
        <DataTable
          rows={data.ports}
          rowKey={(p) => p.id}
          columns={[
            { label: "Port", render: (p) => `${p.name} (${p.island})` },
            { label: "Type", render: (p) => p.port_type },
            { label: "Status", render: (p) => <StatusPill value={p.status} /> },
            {
              label: "Actions",
              render: (p) => (
                <StatusActions
                  current={p.status}
                  transitions={PORT_TRANSITIONS}
                  busy={busy}
                  onSelect={(next) => submit(() => api.setPortStatus(p.id, next as never))}
                />
              ),
            },
          ]}
        />
        <form
          className="mt-4 flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(() =>
              api.createPort({ name: pName, island: pIsland, port_type: pType as never })
            ).then(() => setPName(""));
          }}
        >
          <div className="flex-1">
            <TextField label="Name" value={pName} onChange={setPName} required />
          </div>
          <div className="flex-1">
            <TextField label="Island" value={pIsland} onChange={setPIsland} required />
          </div>
          <SelectField
            label="Type"
            value={pType}
            onChange={setPType}
            options={[
              { value: "sea", label: "sea" },
              { value: "air", label: "air" },
            ]}
          />
          <SubmitButton busy={busy}>Add</SubmitButton>
        </form>
      </Panel>

      <Panel title="Carriers & warehouses">
        <DataTable
          rows={data.carriers}
          rowKey={(c) => c.id}
          empty="No carriers registered."
          limit={5}
          columns={[
            { label: "Carrier", render: (c) => c.name },
            { label: "Mode", render: (c) => c.mode },
            { label: "Capacity", render: (c) => c.capacity ?? "—", numeric: true },
          ]}
        />
        <form
          className="mt-4 flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(() =>
              api.createCarrier({
                name: caName,
                mode: caMode as never,
                capacity: caCapacity ? Number(caCapacity) : null,
              })
            ).then(() => setCaName(""));
          }}
        >
          <div className="flex-1">
            <TextField label="Carrier name" value={caName} onChange={setCaName} required />
          </div>
          <SelectField
            label="Mode"
            value={caMode}
            onChange={setCaMode}
            options={["sea", "air", "land"].map((v) => ({ value: v, label: v }))}
          />
          <div className="w-28">
            <TextField label="Capacity" value={caCapacity} onChange={setCaCapacity} type="number" />
          </div>
          <SubmitButton busy={busy}>Add</SubmitButton>
        </form>
        <div className="mt-6">
          <DataTable
            rows={data.warehouses}
            rowKey={(w) => w.id}
            empty="No warehouses registered."
            limit={5}
            columns={[
              { label: "Warehouse", render: (w) => `${w.name} (${w.island})` },
              { label: "Capacity", render: (w) => w.capacity ?? "—", numeric: true },
              { label: "Cold chain", render: (w) => (w.cold_storage ? "yes" : "no") },
            ]}
          />
        </div>
      </Panel>

      <Panel title="Trade routes">
        <DataTable
          rows={data.routes}
          rowKey={(r) => r.id}
          empty="No routes registered."
          columns={[
            { label: "Route", render: (r) => r.name },
            { label: "Mode", render: (r) => r.mode },
            { label: "Transit (h)", render: (r) => r.transit_hours ?? "—", numeric: true },
            { label: "Active", render: (r) => (r.active ? "yes" : "no") },
          ]}
        />
      </Panel>

      <Panel title="Transport delay predictor">
        <form
          className="flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            api.transportDelay(delayOrigin, delayDest).then(setDelay).catch(() => null);
          }}
        >
          <div className="flex-1">
            <TextField label="Origin" value={delayOrigin} onChange={setDelayOrigin} required />
          </div>
          <div className="flex-1">
            <TextField label="Destination" value={delayDest} onChange={setDelayDest} required />
          </div>
          <SubmitButton>Predict</SubmitButton>
        </form>
        {delay ? (
          <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {String(delay.explanation)}
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
