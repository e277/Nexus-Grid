import { useState } from "react";
import { api } from "../api";
import { DataTable } from "../components/DataTable";
import { FormError, SelectField, SubmitButton, TextField } from "../components/Fields";
import { Panel } from "../components/Panel";
import { StatusActions } from "../components/StatusActions";
import { StatusPill } from "../components/StatusPill";
import { usePoll } from "../hooks";

// Mirrors the backend demand transition map
const DEMAND_TRANSITIONS: Record<string, string[]> = {
  open: ["matched", "cancelled"],
  matched: ["fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: [],
};

async function loadMarket() {
  const [buyers, demands] = await Promise.all([api.buyers(), api.demands()]);
  return { buyers, demands };
}

export function MarketView() {
  const { data, error, refresh } = usePoll(loadMarket);

  const [bName, setBName] = useState("");
  const [bIsland, setBIsland] = useState("");
  const [bType, setBType] = useState("retailer");
  const [dBuyerId, setDBuyerId] = useState("");
  const [dCrop, setDCrop] = useState("");
  const [dQty, setDQty] = useState("");
  const [dNeededBy, setDNeededBy] = useState("");
  const [lookupCrop, setLookupCrop] = useState("");
  const [insight, setInsight] = useState<Record<string, unknown> | null>(null);
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
      <Panel title="Buyers">
        <DataTable
          rows={data.buyers}
          rowKey={(b) => b.id}
          columns={[
            { label: "ID", render: (b) => b.id, numeric: true },
            { label: "Name", render: (b) => b.name },
            { label: "Island", render: (b) => b.island ?? "—" },
            { label: "Type", render: (b) => b.buyer_type },
          ]}
        />
      </Panel>

      <Panel title="Register buyer">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(() =>
              api.createBuyer({
                name: bName,
                island: bIsland || null,
                buyer_type: bType as never,
              })
            ).then(() => setBName(""));
          }}
        >
          <TextField label="Name" value={bName} onChange={setBName} required />
          <TextField label="Island" value={bIsland} onChange={setBIsland} />
          <SelectField
            label="Type"
            value={bType}
            onChange={setBType}
            options={["retailer", "wholesaler", "government"].map((v) => ({
              value: v,
              label: v,
            }))}
          />
          <FormError message={formError} />
          <SubmitButton busy={busy}>Add buyer</SubmitButton>
        </form>
      </Panel>

      <Panel title="Demand">
        <DataTable
          rows={data.demands}
          rowKey={(d) => d.id}
          columns={[
            { label: "Crop", render: (d) => d.crop_name },
            { label: "Qty", render: (d) => d.quantity.toLocaleString(), numeric: true },
            { label: "Status", render: (d) => <StatusPill value={d.status} /> },
            {
              label: "Actions",
              render: (d) => (
                <StatusActions
                  current={d.status}
                  transitions={DEMAND_TRANSITIONS}
                  busy={busy}
                  onSelect={(next) =>
                    submit(() => api.setDemandStatus(d.id, next as never))
                  }
                />
              ),
            },
          ]}
        />
      </Panel>

      <Panel title="Create demand">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(() =>
              api.createDemand({
                buyer_id: Number(dBuyerId),
                crop_name: dCrop,
                quantity: Number(dQty),
                needed_by: dNeededBy || null,
              })
            ).then(() => setDCrop(""));
          }}
        >
          <TextField label="Buyer ID" value={dBuyerId} onChange={setDBuyerId} type="number" required />
          <TextField label="Crop name" value={dCrop} onChange={setDCrop} required />
          <TextField label="Quantity" value={dQty} onChange={setDQty} type="number" required />
          <TextField label="Needed by" value={dNeededBy} onChange={setDNeededBy} type="date" />
          <FormError message={formError} />
          <SubmitButton busy={busy}>Create demand</SubmitButton>
        </form>
      </Panel>

      <Panel title="Market intelligence">
        <form
          className="flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            api.demandForecast(lookupCrop).then(setInsight).catch(() => null);
          }}
        >
          <div className="flex-1">
            <TextField label="Crop" value={lookupCrop} onChange={setLookupCrop} required />
          </div>
          <SubmitButton>Forecast</SubmitButton>
          <button
            type="button"
            onClick={() => api.shortage(lookupCrop).then(setInsight).catch(() => null)}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Shortage
          </button>
        </form>
        {insight ? (
          <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {String(insight.explanation)}
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
