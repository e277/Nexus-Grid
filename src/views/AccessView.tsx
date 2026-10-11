"use client";

import { UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { api, ApiError } from "../api";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { usePoll } from "../hooks";
import type { AccessRole, AccessUser } from "../types";
import { useViewer } from "../viewer";

const ROLES: { value: AccessRole; label: string }[] = [
  { value: "viewer", label: "Viewer" },
  { value: "operator", label: "Operator" },
  { value: "admin", label: "Admin" },
];

const SELECT =
  "h-8 rounded-md border border-ng-border bg-ng-bg px-2 text-ng-sm text-ng-primary focus:outline-none focus-visible:border-ng-accent focus-visible:ring-2 focus-visible:ring-ng-accent disabled:opacity-50";

function when(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function RoleBadge({ role }: { role: AccessRole }) {
  return (
    <Badge variant={role === "viewer" ? "muted" : "success"} size="sm">
      {ROLES.find((r) => r.value === role)?.label ?? role}
    </Badge>
  );
}

/**
 * Who can sign in, managed by admins.
 *
 * Every change here goes through the same API the server enforces, lands in
 * the audit trail under the admin's name, and reaches other instances within
 * half a minute. People the environment names are listed but not editable:
 * that is the deployment owner's lever, kept out of reach of the console so
 * nobody can lock the owners out.
 */
export function AccessView() {
  const viewer = useViewer();
  const { data, error, refresh } = usePoll(() => api.accessOverview(), 60_000);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AccessRole>("viewer");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function save(
    body: { email: string; role: AccessRole; disabled?: boolean },
    done: string
  ): Promise<boolean> {
    setBusy(body.email);
    setMessage(null);
    try {
      await api.grantAccess(body);
      setMessage({ tone: "ok", text: done });
      refresh();
      return true;
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof ApiError ? err.message : "The change could not be saved. Try again.",
      });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function grant(event: FormEvent) {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address) return;
    if (await save({ email: address, role }, `${address} can now sign in as ${role}.`)) setEmail("");
  }

  function change(user: AccessUser, next: Partial<Pick<AccessUser, "role" | "disabled">>) {
    const updated = { email: user.email, role: next.role ?? user.role, disabled: next.disabled ?? user.disabled };
    const text = updated.disabled
      ? `${user.email} can no longer sign in.`
      : `${user.email} is now ${updated.role}.`;
    void save(updated, text);
  }

  if (error && !data) {
    return (
      <Card className="p-5 text-ng-base text-ng-danger-tx">The access list could not be loaded: {error}</Card>
    );
  }
  if (!data) return <Skeleton className="h-64 w-full rounded-xl" />;

  const self = viewer?.email.toLowerCase();

  return (
    <div className="space-y-4">
      {!data.database ? (
        <Card className="border border-ng-warning-bd bg-ng-warning-bg p-4 text-ng-sm leading-snug text-ng-warning-tx">
          <p className="font-semibold">Access can only be changed in the environment right now.</p>
          <p className="mt-1">
            Storing grants from this page needs a database. Set <code className="font-mono">DATABASE_URL</code>{" "}
            on the deployment, and this page starts saving changes.
          </p>
        </Card>
      ) : null}

      <Card className="p-4 sm:p-5">
        <h2 className="text-ng-lg font-semibold text-ng-primary">Grant access</h2>
        <p className="mt-0.5 text-ng-sm text-ng-secondary">
          They sign in with the organisation's identity provider; this decides what they can do once in.
        </p>
        <form onSubmit={grant} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor="grant-email">Email address</label>
          <Input
            id="grant-email"
            type="email"
            required
            placeholder="name@organisation.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!data.database}
            className="h-9 sm:max-w-sm"
          />
          <label className="sr-only" htmlFor="grant-role">Role</label>
          <select
            id="grant-role"
            value={role}
            onChange={(e) => setRole(e.target.value as AccessRole)}
            disabled={!data.database}
            className={`${SELECT} h-9`}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <Button type="submit" disabled={!data.database || busy !== null}>
            <UserPlus size={14} aria-hidden />
            Grant access
          </Button>
        </form>
        {message ? (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={`mt-3 text-ng-sm ${message.tone === "error" ? "text-ng-danger-tx" : "text-ng-success-tx"}`}
          >
            {message.text}
          </p>
        ) : null}
      </Card>

      <Card>
        <div className="border-b border-ng-border/15 px-5 py-3.5">
          <h2 className="text-ng-lg font-semibold text-ng-primary">Granted from the console</h2>
        </div>
        {data.users.length === 0 ? (
          <p className="px-5 py-6 text-ng-base text-ng-secondary">
            Nobody yet. Access currently comes only from the environment, listed below.
          </p>
        ) : (
          <ul className="divide-y divide-ng-border/20">
            {data.users.map((user) => {
              const locked = user.pinned_role !== null || user.email === self || busy !== null;
              return (
                <li key={user.email} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ng-base font-semibold text-ng-primary">
                      {user.name ?? user.email}
                      {user.disabled ? (
                        <Badge variant="danger" size="sm" className="ml-2 align-middle">Disabled</Badge>
                      ) : null}
                    </p>
                    <p className="truncate text-ng-sm text-ng-secondary">
                      {user.name ? `${user.email} · ` : ""}Last sign-in: {when(user.last_sign_in_at)}
                      {user.pinned_role ? ` · Environment sets ${user.pinned_role}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${user.email}`}>Role for {user.email}</label>
                    <select
                      id={`role-${user.email}`}
                      value={user.role}
                      disabled={locked || user.disabled}
                      onChange={(e) => change(user, { role: e.target.value as AccessRole })}
                      className={SELECT}
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant={user.disabled ? "outline" : "danger"}
                      disabled={locked}
                      onClick={() => change(user, { disabled: !user.disabled })}
                    >
                      {user.disabled ? "Restore" : "Remove access"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="text-ng-lg font-semibold text-ng-primary">Set by the environment</h2>
        <p className="mt-0.5 text-ng-sm text-ng-secondary">
          Changed only in the deployment's settings, so the owners can never be locked out from here.
        </p>
        {data.environment.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {data.environment.map((entry) => (
              <li key={`${entry.role}-${entry.email}`} className="flex items-center gap-2 text-ng-base text-ng-primary">
                <RoleBadge role={entry.role} />
                <span className="truncate">{entry.email}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-ng-base text-ng-secondary">No addresses are named.</p>
        )}
        <p className="mt-3 text-ng-sm text-ng-secondary">
          {data.allowed_domains.length > 0
            ? `Anyone with a verified address at ${data.allowed_domains.join(", ")} can sign in as ${data.default_role}, unless removed above.`
            : "No whole domains are allowed."}
        </p>
      </Card>
    </div>
  );
}
