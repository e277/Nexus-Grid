"use client";

import { LogOut } from "lucide-react";

import { signOutOfConsole } from "../../app/actions";
import { useViewer, type ViewerRole } from "../../viewer";
import { Badge } from "../ui/badge";

const ROLE_COPY: Record<ViewerRole, { label: string; detail: string }> = {
  viewer: { label: "Viewer", detail: "Read-only: findings, analysis and the audit trail." },
  operator: { label: "Operator", detail: "Can run sweeps and decide approval gates." },
  admin: { label: "Admin", detail: "Operator rights, plus metrics and administration." },
};

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/**
 * Who is signed in, as what, and the way out.
 *
 * A native disclosure rather than a popover library: it is one panel with one
 * action, and `<details>` gives keyboard and screen-reader behaviour for free.
 */
export function UserMenu() {
  const viewer = useViewer();
  if (!viewer) return null;

  const role = ROLE_COPY[viewer.role];

  return (
    <details className="group relative">
      <summary
        aria-label={`Account: ${viewer.name ?? viewer.email}`}
        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full border border-ng-border bg-ng-raised text-ng-xs font-bold text-ng-primary transition-colors hover:border-ng-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent [&::-webkit-details-marker]:hidden"
      >
        {initials(viewer.name, viewer.email)}
      </summary>

      <div className="absolute right-0 top-10 z-30 w-72 rounded-lg border border-ng-border bg-ng-surface p-4 shadow-ng-md">
        <p className="truncate text-ng-base font-semibold text-ng-primary">
          {viewer.name ?? viewer.email}
        </p>
        {viewer.name ? (
          <p className="truncate text-ng-sm text-ng-secondary">{viewer.email}</p>
        ) : null}

        <div className="mt-3 flex items-start gap-2">
          <Badge variant={viewer.role === "viewer" ? "muted" : "success"} size="sm">
            {role.label}
          </Badge>
          <p className="text-ng-sm leading-snug text-ng-secondary">{role.detail}</p>
        </div>

        <form action={signOutOfConsole} className="mt-4 border-t border-ng-border pt-3">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-ng-sm font-semibold text-ng-primary transition-colors hover:bg-ng-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
          >
            <LogOut size={14} aria-hidden />
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
