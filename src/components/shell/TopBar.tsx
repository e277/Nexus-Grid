"use client";

import { cn } from "../../lib/utils";
import type { Health } from "../../types";
import { ThemeToggle } from "../ThemeToggle";

interface TopBarProps {
  health: Health | null;
}

/**
 * The whole chrome, now that there is one page.
 *
 * There was a 240px rail beside this bar. With a single destination it held a
 * nav that could not navigate, so what it carried that was actually worth
 * keeping — the brand and the runtime's own status — moved here, and the rail
 * went. The alternative was a permanent sixth of the viewport spent on a
 * button that was always already selected.
 */
export function TopBar({ health }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-ng-border bg-ng-surface/85 px-4 backdrop-blur-md sm:px-6">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-ng-accent text-[11px] font-extrabold tracking-tight text-ng-accent-fg">
        NG
      </div>

      {/* The page's own heading is in the page, immediately below. Repeating
          it here would put the same words twice on a screen that now only
          has one of them. */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold leading-tight tracking-tight text-ng-primary">
          Nexus-Grid
        </p>
        <p className="truncate text-ng-2xs font-medium uppercase tracking-wide text-ng-secondary">
          Caribbean food coordination
        </p>
      </div>

      {/* The dot pulses only while the runtime is actually answering, so a dead
          backend reads as a still, grey dot rather than a reassuring
          animation. The words drop below `sm`, where the dot and its title
          still carry the same state. */}
      <span
        className="flex shrink-0 items-center gap-2"
        title={
          health
            ? `System online · ${health.app} ${health.version} · ${health.environment}`
            : "Connecting to the runtime…"
        }
      >
        <span className="relative flex h-2 w-2 shrink-0">
          {health ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ng-success opacity-60" />
          ) : null}
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              health ? "bg-ng-success" : "bg-ng-muted-bd"
            )}
          />
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-ng-2xs font-semibold leading-tight text-ng-primary">
            {health ? "System Online" : "Connecting…"}
          </span>
          <span className="block truncate text-ng-2xs capitalize leading-tight text-ng-secondary">
            {health ? `${health.version} · ${health.environment}` : "—"}
          </span>
        </span>
      </span>

      <ThemeToggle />
    </header>
  );
}
