import { Activity, Bell, Database, Radio, Workflow } from "lucide-react";
import { useState } from "react";
import { api } from "./api";
import { usePoll } from "./hooks";
import { ObservabilityView } from "./views/ObservabilityView";
import { SignalsView } from "./views/SignalsView";
import { SourcesView } from "./views/SourcesView";
import { WorkflowView } from "./views/WorkflowView";

export type TabId = "signals" | "sources" | "coordination" | "observability";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

const TABS: Tab[] = [
  { id: "signals",       label: "Signals",       icon: <Radio size={15} /> },
  { id: "sources",       label: "Sources",       icon: <Database size={15} /> },
  { id: "coordination",  label: "Coordination",  icon: <Workflow size={15} /> },
  { id: "observability", label: "Observability", icon: <Activity size={15} /> },
];

const TAB_LABELS: Record<TabId, string> = {
  signals:       "Coordination Signals",
  sources:       "Upstream Sources",
  coordination:  "Coordination Cycle",
  observability: "Agent Activity & Audit",
};

export default function App() {
  const [tab, setTab] = useState<TabId>("signals");
  const [notifOpen, setNotifOpen] = useState(false);
  const [lastSeenId, setLastSeenId] = useState<number | null>(null);

  const { data: health } = usePoll(() => api.health(), 30_000);

  const { data: recentActivity } = usePoll(
    () => api.agentActivities({ limit: 5 }).catch(() => null),
    20_000
  );

  const unreadCount = recentActivity
    ? recentActivity.filter((a) => lastSeenId === null || a.id > lastSeenId).length
    : 0;

  function toggleNotifications() {
    setNotifOpen((open) => {
      const next = !open;
      if (next && recentActivity && recentActivity.length > 0) {
        setLastSeenId(Math.max(...recentActivity.map((a) => a.id)));
      }
      return next;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-ng-bg">

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-ng-border bg-ng-surface">

        {/* Brand */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-ng-border px-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-ng-accent text-[11px] font-extrabold tracking-tight text-ng-accent-fg">
            NG
          </div>
          <div>
            <p className="text-sm font-bold leading-tight tracking-tight text-ng-primary">Nexus-Grid</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-ng-secondary">v1.0 · Orchestration</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          <p className="px-2.5 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[.8px] text-ng-secondary">
            Workspace
          </p>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-ng-accent-lit font-semibold text-ng-accent"
                  : "text-ng-secondary hover:bg-ng-bg hover:text-ng-primary"
              }`}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${tab === t.id ? "opacity-100" : "opacity-70"}`}>
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </nav>

        {/* Runtime */}
        <div className="shrink-0 border-t border-ng-border px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[.8px] text-ng-secondary">
            Runtime
          </p>
          <p className="mt-1 truncate text-xs text-ng-primary">
            {health ? `${health.app} ${health.version}` : "—"}
          </p>
          <p className="text-[11px] capitalize text-ng-secondary">
            {health?.environment ?? "connecting…"}
          </p>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-ng-border bg-white/85 px-5 backdrop-blur-md">
          {/* Breadcrumb */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-ng-secondary">
            <span>Nexus-Grid</span>
            <span className="text-ng-border">/</span>
            <span className="font-semibold text-ng-primary">{TAB_LABELS[tab]}</span>
          </div>

          {/* Status + user */}
          <div className="flex items-center gap-2">
            {health ? (
              <span className="flex items-center gap-1.5 rounded-full border border-ng-success-bd bg-ng-success-bg px-2.5 py-1 text-[11px] font-semibold text-ng-success-tx">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ng-success" />
                {health.status === "ok" ? "All systems operational" : health.status}
              </span>
            ) : (
              <span className="text-xs text-ng-secondary">Connecting…</span>
            )}

            <div className="relative z-30">
              <button
                aria-label="Notifications"
                onClick={toggleNotifications}
                className="relative flex h-8 w-8 items-center justify-center rounded-md border border-ng-border bg-ng-surface text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent focus-visible:ring-offset-1"
              >
                <Bell size={15} />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-ng-danger px-1 text-[9px] font-bold text-white">
                    {unreadCount}
                  </span>
                ) : null}
              </button>
              {notifOpen ? (
                <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-80 rounded-[10px] border border-ng-border bg-ng-surface shadow-ng-md">
                  <div className="border-b border-ng-border px-4 py-2.5">
                    <p className="text-sm font-semibold text-ng-primary">Recent agent activity</p>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {recentActivity === null ? (
                      <p className="px-4 py-4 text-sm text-ng-secondary">Agent activity is unavailable.</p>
                    ) : recentActivity.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-ng-secondary">No agent activity yet.</p>
                    ) : (
                      recentActivity.map((a) => (
                        <div key={a.id} className="border-b border-ng-border px-4 py-2.5 last:border-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-ng-accent">{a.agent_name}</span>
                            <span className="text-ng-2xs text-ng-secondary">{timeAgo(a.created_at)}</span>
                          </div>
                          <p className="mt-0.5 text-sm text-ng-primary">{a.action}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

          </div>

          {notifOpen ? (
            <div className="fixed inset-0 z-20" onClick={() => setNotifOpen(false)} />
          ) : null}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {tab === "signals"       && <SignalsView />}
          {tab === "sources"       && <SourcesView />}
          {tab === "coordination"  && <WorkflowView />}
          {tab === "observability" && <ObservabilityView />}
        </main>
      </div>
    </div>
  );
}
