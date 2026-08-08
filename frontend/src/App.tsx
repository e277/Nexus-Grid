import { useEffect, useState } from "react";
import { api, UnauthorizedError } from "./api";
import { clearToken, getToken } from "./auth";
import { LoginPanel } from "./components/LoginPanel";
import { setUnauthorizedHandler, usePoll } from "./hooks";
import { FarmView } from "./views/FarmView";
import { GovernmentView } from "./views/GovernmentView";
import { LogisticsView } from "./views/LogisticsView";
import { MarketView } from "./views/MarketView";
import { OverviewView } from "./views/OverviewView";
import { WorkflowView } from "./views/WorkflowView";

type TabId = "overview" | "farm" | "market" | "logistics" | "government" | "workflow";

interface Tab {
  id: TabId;
  label: string;
  roles: string[] | null;
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

const WorkflowIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
    <circle cx="2.25" cy="7.5" r="1.75" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="7.5" cy="2.5" r="1.75" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="7.5" cy="12.5" r="1.75" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="12.75" cy="7.5" r="1.75" stroke="currentColor" strokeWidth="1.2" />
    <path d="M3.8 6.6L6.2 3.7M6.2 11.3L3.8 8.4M8.8 3.7L11.2 6.6M11.2 8.4L8.8 11.3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
  </svg>
);

const BellIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
    <path d="M7.5 1.5C5.567 1.5 4 3.067 4 5V8.5L2.5 10H12.5L11 8.5V5C11 3.067 9.433 1.5 7.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M6 10.5C6 11.328 6.672 12 7.5 12C8.328 12 9 11.328 9 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const TABS: Tab[] = [
  { id: "overview",    label: "Overview",    roles: null,                                          icon: <OverviewIcon /> },
  { id: "farm",        label: "Farm",        roles: ["farmer","government","admin"],                icon: <FarmIcon /> },
  { id: "market",      label: "Market",      roles: ["buyer","government","admin"],                 icon: <MarketIcon /> },
  { id: "logistics",   label: "Logistics",   roles: ["logistics","government","admin"],             icon: <LogisticsIcon /> },
  { id: "government",  label: "Government",  roles: ["government","admin"],                        icon: <GovIcon /> },
  { id: "workflow",    label: "Workflow",     roles: ["government","admin"],                        icon: <WorkflowIcon /> },
];

const TAB_LABELS: Record<TabId, string> = {
  overview:   "Operator Dashboard",
  farm:       "Farm Intelligence",
  market:     "Market Demand",
  logistics:  "Logistics",
  government: "Government",
  workflow:   "Workflow Builder",
};

export default function App() {
  const [authenticated, setAuthenticated] = useState(() => getToken() !== null);
  const [user, setUser] = useState<{ email: string; role: string } | null>(null);
  const [tab, setTab] = useState<TabId>("overview");

  function logout() {
    clearToken();
    setUser(null);
    setTab("overview");
    setAuthenticated(false);
  }

  useEffect(() => { setUnauthorizedHandler(logout); }, []);

  useEffect(() => {
    if (!authenticated) return;
    api.me().then(setUser).catch((err) => { if (err instanceof UnauthorizedError) logout(); });
  }, [authenticated]);

  const { data: health } = usePoll(
    () => (authenticated ? api.health() : Promise.resolve(null)),
    30_000
  );

  if (!authenticated) {
    return <LoginPanel onAuthenticated={() => setAuthenticated(true)} />;
  }

  const visibleTabs = TABS.filter(
    (t) => t.roles === null || (user !== null && t.roles.includes(user.role))
  );

  const initials = user
    ? user.email.split("@")[0].slice(0, 2).toUpperCase()
    : "–";

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
            <p className="text-[10px] font-medium uppercase tracking-wide text-ng-secondary">v1.0 · Operator</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          <p className="px-2.5 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[.8px] text-ng-secondary">
            Workspace
          </p>
          {visibleTabs.map((t) => (
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

        {/* User */}
        <div className="shrink-0 border-t border-ng-border p-2">
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-ng-bg"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ng-accent to-purple-600 text-[10px] font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-ng-primary">{user?.email ?? "—"}</p>
              <p className="text-[11px] capitalize text-ng-secondary">{user?.role ?? "—"}</p>
            </div>
            <span className="text-xs text-ng-secondary">Sign out</span>
          </button>
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

            <button
              aria-label="Notifications"
              className="relative flex h-8 w-8 items-center justify-center rounded-md border border-ng-border bg-ng-surface text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent focus-visible:ring-offset-1"
            >
              <BellIcon />
            </button>

            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ng-accent to-purple-600 text-[11px] font-bold text-white">
              {initials}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {tab === "overview"   && <OverviewView />}
          {tab === "farm"       && <FarmView />}
          {tab === "market"     && <MarketView />}
          {tab === "logistics"  && <LogisticsView />}
          {tab === "government" && <GovernmentView />}
          {tab === "workflow"   && <WorkflowView />}
        </main>
      </div>
    </div>
  );
}
