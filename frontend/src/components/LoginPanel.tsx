import { useState } from "react";
import { login, register } from "../auth";

const ROLES = ["farmer", "buyer", "logistics", "government", "admin"] as const;

interface LoginPanelProps {
  onAuthenticated: () => void;
}

export function LoginPanel({ onAuthenticated }: LoginPanelProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("farmer");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inputCls =
    "mt-1 block w-full rounded-md border border-ng-border bg-ng-surface px-3 py-2 text-sm text-ng-primary placeholder:text-ng-disabled focus:border-ng-accent focus:outline-none focus:ring-2 focus:ring-ng-accent focus:ring-offset-1";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") await register(email, password, role);
      await login(email, password);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ng-bg px-4">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[7px] bg-ng-accent text-sm font-extrabold tracking-tight text-ng-accent-fg">
            NG
          </div>
          <div>
            <p className="text-base font-bold tracking-tight text-ng-primary">Nexus-Grid</p>
            <p className="text-xs text-ng-secondary">Caribbean food system orchestration</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-ng-border bg-ng-surface p-6 shadow-none">
          <h1 className="text-base font-semibold text-ng-primary">
            {mode === "login" ? "Sign in to continue" : "Create an account"}
          </h1>
          <p className="mt-0.5 text-xs text-ng-secondary">
            {mode === "login"
              ? "Operator console · Caribbean food system orchestration"
              : "Select your role to get access to your domain"}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-ng-primary">
              Email address
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username"
                className={inputCls}
              />
            </label>

            <label className="block text-sm font-medium text-ng-primary">
              Password
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className={inputCls}
              />
            </label>

            {mode === "register" ? (
              <label className="block text-sm font-medium text-ng-primary">
                Role
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={inputCls}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r} className="capitalize">{r}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {error ? (
              <p className="rounded-md border border-ng-warning-bd bg-ng-warning-bg px-3 py-2 text-sm text-ng-warning-tx">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 w-full rounded-md bg-ng-accent py-2.5 text-sm font-semibold text-ng-accent-fg transition-colors hover:bg-ng-accent-hov focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent focus-visible:ring-offset-1 disabled:opacity-50"
            >
              {busy
                ? "Working…"
                : mode === "login"
                ? "Sign in"
                : "Create account"}
            </button>
          </form>
        </div>

        <button
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
          className="mt-4 w-full text-center text-sm text-ng-secondary transition-colors hover:text-ng-primary"
        >
          {mode === "login" ? "No account? Register →" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
