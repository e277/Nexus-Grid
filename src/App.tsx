import { useState } from "react";
import { api } from "./api";
import { usePoll } from "./hooks";
import { FarmView } from "./views/FarmView";
import { GovernmentView } from "./views/GovernmentView";
import { LogisticsView } from "./views/LogisticsView";
import { MarketView } from "./views/MarketView";
import { OverviewView } from "./views/OverviewView";

export type TabId = "overview" | "farm" | "market" | "logistics" | "government";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

const OverviewIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
    <rect x="1" y="1" width="5.5" height="5.5" rx="1" fill="currentColor" />
    <rect x="8.5" y="1" width="5.5" height="5.5" rx="1" fill="currentColor" />
    <rect x="1" y="8.5" width="5.5" height="5.5" rx="1" fill="currentColor" />
    <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" fill="currentColor" />
  </svg>
);

const FarmIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
    <path d="M7.5 1.5C5.015 1.5 3 4.5 3 7.5C3 10.538 5.015 13 7.5 13C9.985 13 12 10.538 12 7.5C12 4.5 9.985 1.5 7.5 1.5Z" stroke="currentColor" strokeWidth="1.2" />
    <path d="M7.5 5V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const MarketIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
    <path d="M1 11L5 7L8 10L11 5L14 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LogisticsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
    <path d="M1 7.5H14M4 7.5L5 3H10L11 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <rect x="2" y="7.5" width="11" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const GovIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
    <path d="M7.5 2L9 5.5L13 5.8L10.5 8L11.2 12L7.5 10L3.8 12L4.5 8L2 5.8L6 5.5L7.5 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

const BellIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
    <path d="M7.5 1.5C5.567 1.5 4 3.067 4 5V8.5L2.5 10H12.5L11 8.5V5C11 3.067 9.433 1.5 7.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M6 10.5C6 11.328 6.672 12 7.5 12C8.328 12 9 11.328 9 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

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
  { id: "overview",    label: "Overview",    icon: <OverviewIcon /> },
  { id: "farm",        label: "Farm",        icon: <FarmIcon /> },
  { id: "market",      label: "Market",      icon: <MarketIcon /> },
  { id: "logistics",   label: "Logistics",   icon: <LogisticsIcon /> },
  { id: "government",  label: "Government",  icon: <GovIcon /> },
];

const TAB_LABELS: Record<TabId, string> = {
  overview:   "Operator Dashboard",
  farm:       "Farm Intelligence",
  market:     "Market Demand",
  logistics:  "Logistics",
  government: "Government",
};

export default function App() {
  const [tab, setTab] = useState<TabId>("overview");
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
                <BellIcon />
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
          {tab === "overview"   && <OverviewView onNavigate={setTab} />}
          {tab === "farm"       && <FarmView />}
          {tab === "market"     && <MarketView />}
          {tab === "logistics"  && <LogisticsView />}
          {tab === "government" && <GovernmentView />}
        </main>
      </div>
    </div>
  );
}
