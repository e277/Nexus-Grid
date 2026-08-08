import { useState } from "react";
import { api } from "../api";
import { BarChart } from "../components/charts/BarChart";
import { DataTable } from "../components/DataTable";
import { FormError, SubmitButton, TextField } from "../components/Fields";
import { Panel } from "../components/Panel";
import { StatTile } from "../components/StatTile";
import { usePoll } from "../hooks";

async function loadFarm() {
  const [farmers, crops] = await Promise.all([api.farmers(), api.crops()]);
  return { farmers, crops };
}

export function FarmView() {
  const { data, error, refresh } = usePoll(loadFarm);

  // Farmer form
  const [fName, setFName] = useState("");
  const [fIsland, setFIsland] = useState("");
  const [fCapacity, setFCapacity] = useState("");
  // Crop form
  const [cFarmerId, setCFarmerId] = useState("");
  const [cName, setCName] = useState("");
  const [cQty, setCQty] = useState("");
  const [cHarvest, setCHarvest] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [spoilage, setSpoilage] = useState<Record<string, unknown> | null>(null);

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

  const totalInventory = data.crops.reduce((sum, c) => sum + c.quantity, 0);
  const quantityByCrop = new Map<string, number>();
  for (const c of data.crops) {
    quantityByCrop.set(c.crop_name, (quantityByCrop.get(c.crop_name) ?? 0) + c.quantity);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatTile label="Farmers" value={data.farmers.length} />
        <StatTile label="Crop lots" value={data.crops.length} />
        <StatTile label="Total inventory" value={totalInventory.toLocaleString()} hint="units across all lots" />
      </div>

      {quantityByCrop.size > 0 ? (
        <Panel title="Inventory by crop" subtitle="Total logged quantity across all farmers">
          <BarChart
            categories={Array.from(quantityByCrop.entries()).map(([crop_name, quantity]) => ({
              key: crop_name,
              label: crop_name,
              values: { quantity },
            }))}
            series={[{ key: "quantity", label: "Quantity", colorVar: "var(--chart-1)" }]}
          />
        </Panel>
      ) : null}

    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Farmers" subtitle="Registered producers" noPad>
        <DataTable
          rows={data.farmers}
          rowKey={(f) => f.id}
          columns={[
            { label: "ID", render: (f) => f.id, numeric: true },
            { label: "Name", render: (f) => f.name },
            { label: "Island", render: (f) => f.island ?? "—" },
            { label: "Capacity", render: (f) => f.capacity ?? "—", numeric: true },
          ]}
        />
      </Panel>

      <Panel title="Register farmer" subtitle="Add a new farmer to the platform">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(() =>
              api.createFarmer({
                name: fName,
                island: fIsland || null,
                capacity: fCapacity ? Number(fCapacity) : null,
              })
            ).then(() => setFName(""));
          }}
        >
          <TextField label="Name" value={fName} onChange={setFName} required />
          <TextField label="Island" value={fIsland} onChange={setFIsland} />
          <TextField label="Capacity" value={fCapacity} onChange={setFCapacity} type="number" />
          <FormError message={formError} />
          <SubmitButton busy={busy}>Add farmer</SubmitButton>
        </form>
      </Panel>

      <Panel title="Crop inventory" subtitle="All logged harvests and quantities" noPad>
        <DataTable
          rows={data.crops}
          rowKey={(c) => c.id}
          columns={[
            { label: "ID", render: (c) => c.id, numeric: true },
            { label: "Crop", render: (c) => c.crop_name },
            { label: "Qty", render: (c) => c.quantity.toLocaleString(), numeric: true },
            { label: "Harvested", render: (c) => c.harvest_date ?? "—" },
            {
              label: "Spoilage",
              render: (c) => (
                <button
                  className="rounded border border-ng-border px-2 py-0.5 text-xs text-ng-secondary transition-colors hover:bg-ng-bg"
                  onClick={() => api.spoilage(c.id).then(setSpoilage).catch(() => null)}
                >
                  check
                </button>
              ),
            },
          ]}
        />
        {spoilage ? (
          <p className="mt-3 rounded-md border border-ng-border bg-ng-bg px-3 py-2 text-sm text-ng-secondary">
            <span className="font-semibold">{String(spoilage.risk)} risk:</span>{" "}
            {String(spoilage.explanation)}
          </p>
        ) : null}
      </Panel>

      <Panel title="Log harvest" subtitle="Record a new crop lot">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(() =>
              api.createCrop({
                farmer_id: Number(cFarmerId),
                crop_name: cName,
                quantity: Number(cQty),
                harvest_date: cHarvest || null,
              })
            ).then(() => setCName(""));
          }}
        >
          <TextField label="Farmer ID" value={cFarmerId} onChange={setCFarmerId} type="number" required />
          <TextField label="Crop name" value={cName} onChange={setCName} required />
          <TextField label="Quantity" value={cQty} onChange={setCQty} type="number" required />
          <TextField label="Harvest date" value={cHarvest} onChange={setCHarvest} type="date" />
          <FormError message={formError} />
          <SubmitButton busy={busy}>Add crop</SubmitButton>
        </form>
      </Panel>
    </div>
    </div>
  );
}
