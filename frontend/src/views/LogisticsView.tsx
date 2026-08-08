import { useState } from "react";
import { api } from "../api";
import { SegmentedBar } from "../components/charts/SegmentedBar";
import { DataTable } from "../components/DataTable";
import { FormError, SelectField, SubmitButton, TextField } from "../components/Fields";
import { Modal } from "../components/Modal";
import { Panel } from "../components/Panel";
import { StatTile } from "../components/StatTile";
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

// Same semantic tokens StatusPill already maps these statuses to — a chart
// must never show "delayed" in a different color than the pill beside it.
const PORT_STATUS_COLOR: Record<string, string> = {
  open: "var(--color-info-text)",
  congested: "var(--color-warning-text)",
  closed: "var(--color-danger-text)",
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

type ModalKind = "shipment" | "port" | "carrier" | "warehouse" | "route" | null;

export function LogisticsView() {
  const { data, error, refresh } = usePoll(loadLogistics);
  const [openModal, setOpenModal] = useState<ModalKind>(null);

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
  const [wName, setWName] = useState("");
  const [wIsland, setWIsland] = useState("");
  const [wCapacity, setWCapacity] = useState("");
  const [wColdStorage, setWColdStorage] = useState("yes");
  const [rName, setRName] = useState("");
  const [rOriginPortId, setROriginPortId] = useState("");
  const [rDestPortId, setRDestPortId] = useState("");
  const [rMode, setRMode] = useState("sea");
  const [rTransitHours, setRTransitHours] = useState("");
  const [rActive, setRActive] = useState("true");
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

  if (error) return <p className="rounded-md border border-ng-warning-bd bg-ng-warning-bg px-4 py-3 text-sm text-ng-warning-tx">Failed to load: {error}</p>;
  if (!data) return <p className="text-sm text-ng-secondary">Loading…</p>;

  const activeShipments = data.shipments.filter((s) => ["planned", "in_transit", "delayed"].includes(s.status));
  const portStatusCounts = data.ports.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Active shipments" value={activeShipments.length} hint={`${data.shipments.length} total`} />
        <StatTile label="Ports" value={data.ports.length} hint={`${portStatusCounts.open ?? 0} open`} />
        <StatTile label="Carriers" value={data.carriers.length} />
        <StatTile label="Warehouses" value={data.warehouses.length} />
      </div>

      <Panel title="Port status mix" subtitle="Current status across all registered ports">
        <SegmentedBar
          segments={["open", "congested", "closed"].map((status) => ({
            key: status,
            label: status,
            value: portStatusCounts[status] ?? 0,
            colorVar: PORT_STATUS_COLOR[status],
          }))}
        />
      </Panel>

      <Panel title="Shipments" action={{ label: "+ Book shipment", onClick: () => setOpenModal("shipment") }}>
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

      <Panel title="Ports" action={{ label: "+ Add port", onClick: () => setOpenModal("port") }}>
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
      </Panel>

      <Panel title="Carriers" action={{ label: "+ Add carrier", onClick: () => setOpenModal("carrier") }}>
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
      </Panel>

      <Panel title="Warehouses" subtitle="Cold-chain capable storage" action={{ label: "+ Add warehouse", onClick: () => setOpenModal("warehouse") }}>
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
      </Panel>

      <Panel title="Trade routes" action={{ label: "+ Add route", onClick: () => setOpenModal("route") }}>
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

      <Panel title="Transport delay predictor" subtitle="Estimate risk for a lane">
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
          <p className="mt-4 rounded-md border border-ng-border bg-ng-well px-3 py-2 text-sm text-ng-secondary">
            {String(delay.explanation)}
          </p>
        ) : null}
      </Panel>

      {openModal === "shipment" ? (
        <Modal title="Book shipment" onClose={() => setOpenModal(null)}>
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
              ).then(() => setOpenModal(null));
            }}
          >
            <TextField label="Crop ID" value={sCropId} onChange={setSCropId} type="number" required />
            <TextField label="Origin island" value={sOrigin} onChange={setSOrigin} required />
            <TextField label="Destination island" value={sDest} onChange={setSDest} required />
            <TextField label="Quantity" value={sQty} onChange={setSQty} type="number" required />
            <TextField label="Carrier" value={sCarrier} onChange={setSCarrier} />
            <SubmitButton busy={busy}>Book</SubmitButton>
          </form>
        </Modal>
      ) : null}

      {openModal === "port" ? (
        <Modal title="Add port" onClose={() => setOpenModal(null)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit(() =>
                api.createPort({ name: pName, island: pIsland, port_type: pType as never })
              ).then(() => {
                setPName("");
                setOpenModal(null);
              });
            }}
          >
            <TextField label="Name" value={pName} onChange={setPName} required />
            <TextField label="Island" value={pIsland} onChange={setPIsland} required />
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
        </Modal>
      ) : null}

      {openModal === "carrier" ? (
        <Modal title="Add carrier" onClose={() => setOpenModal(null)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit(() =>
                api.createCarrier({
                  name: caName,
                  mode: caMode as never,
                  capacity: caCapacity ? Number(caCapacity) : null,
                })
              ).then(() => {
                setCaName("");
                setOpenModal(null);
              });
            }}
          >
            <TextField label="Carrier name" value={caName} onChange={setCaName} required />
            <SelectField
              label="Mode"
              value={caMode}
              onChange={setCaMode}
              options={["sea", "air", "land"].map((v) => ({ value: v, label: v }))}
            />
            <TextField label="Capacity" value={caCapacity} onChange={setCaCapacity} type="number" />
            <SubmitButton busy={busy}>Add</SubmitButton>
          </form>
        </Modal>
      ) : null}

      {openModal === "warehouse" ? (
        <Modal title="Add warehouse" onClose={() => setOpenModal(null)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit(() =>
                api.createWarehouse({
                  name: wName,
                  island: wIsland,
                  capacity: wCapacity ? Number(wCapacity) : null,
                  cold_storage: wColdStorage === "yes",
                })
              ).then(() => {
                setWName("");
                setWIsland("");
                setWCapacity("");
                setWColdStorage("yes");
                setOpenModal(null);
              });
            }}
          >
            <TextField label="Warehouse name" value={wName} onChange={setWName} required />
            <TextField label="Island" value={wIsland} onChange={setWIsland} required />
            <TextField label="Capacity" value={wCapacity} onChange={setWCapacity} type="number" />
            <SelectField
              label="Cold chain"
              value={wColdStorage}
              onChange={setWColdStorage}
              options={[
                { value: "yes", label: "yes" },
                { value: "no", label: "no" },
              ]}
            />
            <SubmitButton busy={busy}>Add warehouse</SubmitButton>
          </form>
        </Modal>
      ) : null}

      {openModal === "route" ? (
        <Modal title="Add trade route" onClose={() => setOpenModal(null)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit(() =>
                api.createTradeRoute({
                  name: rName,
                  origin_port_id: Number(rOriginPortId),
                  destination_port_id: Number(rDestPortId),
                  mode: rMode as never,
                  transit_hours: rTransitHours ? Number(rTransitHours) : null,
                  active: rActive === "true",
                })
              ).then(() => {
                setRName("");
                setROriginPortId("");
                setRDestPortId("");
                setRMode("sea");
                setRTransitHours("");
                setRActive("true");
                setOpenModal(null);
              });
            }}
          >
            <TextField label="Route name" value={rName} onChange={setRName} required />
            <TextField label="Origin port ID" value={rOriginPortId} onChange={setROriginPortId} type="number" required />
            <TextField label="Destination port ID" value={rDestPortId} onChange={setRDestPortId} type="number" required />
            <SelectField
              label="Mode"
              value={rMode}
              onChange={setRMode}
              options={[
                { value: "sea", label: "sea" },
                { value: "air", label: "air" },
              ]}
            />
            <TextField label="Transit hours" value={rTransitHours} onChange={setRTransitHours} type="number" />
            <SelectField
              label="Active"
              value={rActive}
              onChange={setRActive}
              options={[
                { value: "true", label: "yes" },
                { value: "false", label: "no" },
              ]}
            />
            <SubmitButton busy={busy}>Add route</SubmitButton>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
