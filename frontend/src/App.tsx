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

type TabId = "overview" | "farm" | "market" | "logistics" | "government";

interface Tab {
  id: TabId;
  label: string;
  roles: string[] | null; // null = everyone
}

const TABS: Tab[] = [
  { id: "overview", label: "Overview", roles: null },
  { id: "farm", label: "Farm", roles: ["farmer", "government", "admin"] },
  { id: "market", label: "Market", roles: ["buyer", "government", "admin"] },
  { id: "logistics", label: "Logistics", roles: ["logistics", "government", "admin"] },
  { id: "government", label: "Government", roles: ["government", "admin"] },
];

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

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    api
      .me()
      .then(setUser)
      .catch((err) => {
        if (err instanceof UnauthorizedError) logout();
      });
  }, [authenticated]);

  const { data: health } = usePoll(
    () => (authenticated ? api.health() : Promise.resolve(null)),
    30_000
  );

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-6xl px-4">
        <LoginPanel onAuthenticated={() => setAuthenticated(true)} />
      </div>
    );
  }

  const visibleTabs = TABS.filter(
    (t) => t.roles === null || (user !== null && t.roles.includes(user.role))
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nexus-Grid</h1>
          <p className="text-sm text-slate-500">
            Operator console · Caribbean food system orchestration
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-500">
            {health
              ? `${health.app} v${health.version} · ${health.environment} · ${health.status}`
              : "connecting…"}
          </p>
          {user ? (
            <p className="mt-1 text-sm text-slate-500">
              {user.email} · {user.role}{" "}
              <button
                onClick={logout}
                className="ml-2 rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Sign out
              </button>
            </p>
          ) : null}
        </div>
      </header>

      <nav className="mb-8 flex gap-1 border-b border-slate-200">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${
              tab === t.id
                ? "border border-b-0 border-slate-200 bg-white text-slate-900"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" ? <OverviewView /> : null}
      {tab === "farm" ? <FarmView /> : null}
      {tab === "market" ? <MarketView /> : null}
      {tab === "logistics" ? <LogisticsView /> : null}
      {tab === "government" ? <GovernmentView /> : null}
    </div>
  );
}
