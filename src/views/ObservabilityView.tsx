import { api } from "../api";
import { DataTable } from "../components/DataTable";
import { Panel } from "../components/Panel";
import { usePoll } from "../hooks";
import type { AgentActivity, AuditLog } from "../types";

async function loadObservability() {
  const [activities, audits] = await Promise.all([
    api.agentActivities({ limit: 100 }),
    api.auditLogs({ limit: 100 }),
  ]);
  return { activities, audits };
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

function confidenceClass(confidence: number | null | undefined): string {
  if (confidence === null || confidence === undefined) return "text-ng-secondary";
  if (confidence >= 0.8) return "text-ng-success-tx";
  if (confidence >= 0.5) return "text-ng-warning-tx";
  return "text-ng-secondary";
}

export function ObservabilityView() {
  const { data, error } = usePoll(loadObservability, 15_000);

  if (error) {
    return (
      <p className="rounded-md border border-ng-warning-bd bg-ng-warning-bg px-4 py-3 text-sm text-ng-warning-tx">
        Failed to load: {error}
      </p>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-[10px] border border-ng-border bg-ng-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Agent decisions"
        subtitle="Every autonomous decision, its confidence, and the reasoning behind it"
        noPad
      >
        <DataTable<AgentActivity>
          rows={data.activities.slice().reverse()}
          rowKey={(a) => a.id}
          limit={25}
          empty="No agent decisions recorded yet — the scan runs on an interval."
          columns={[
            {
              label: "Agent",
              render: (a) => (
                <span className="font-mono text-xs text-ng-accent">{a.agent_name}</span>
              ),
            },
            { label: "Action", render: (a) => a.action },
            {
              label: "Confidence",
              numeric: true,
              render: (a) => (
                <span className={`font-medium ${confidenceClass(a.confidence)}`}>
                  {a.confidence === null || a.confidence === undefined
                    ? "—"
                    : a.confidence.toFixed(2)}
                </span>
              ),
            },
            {
              label: "When",
              render: (a) => <span className="text-ng-secondary">{timeAgo(a.created_at)}</span>,
            },
          ]}
        />
      </Panel>

      <Panel
        title="Audit trail"
        subtitle="State changes, attributed to the integrating system via the X-Actor header"
        noPad
      >
        <DataTable<AuditLog>
          rows={data.audits.slice().reverse()}
          rowKey={(a) => a.id}
          limit={25}
          empty="No state changes recorded yet."
          columns={[
            {
              label: "Actor",
              render: (a) => <span className="font-mono text-xs">{a.actor}</span>,
            },
            { label: "Action", render: (a) => a.action },
            {
              label: "Entity",
              render: (a) => (
                <span className="text-ng-secondary">
                  {a.entity_type ?? "—"}
                  {a.entity_id ? ` #${a.entity_id}` : ""}
                </span>
              ),
            },
            {
              label: "When",
              render: (a) => <span className="text-ng-secondary">{timeAgo(a.created_at)}</span>,
            },
          ]}
        />
      </Panel>
    </div>
  );
}
