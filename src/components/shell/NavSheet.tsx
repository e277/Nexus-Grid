"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

import { cn } from "../../lib/utils";
import { NAV_GROUPS, type PageId } from "../../navigation";
import type { Health } from "../../types";

/**
 * The full navigation tree on small screens.
 *
 * The bottom bar carries three destinations; the other four have to be
 * reachable somewhere, and a slide-over is the honest place for them rather
 * than a seven-item tab bar nobody can hit with a thumb.
 */
export function NavSheet({
  open,
  page,
  onNavigate,
  onClose,
  health,
}: {
  open: boolean;
  page: PageId;
  onNavigate: (id: PageId) => void;
  onClose: () => void;
  health: Health | null;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div
        className="absolute inset-0 bg-black/60"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-ng-border bg-ng-surface shadow-ng-md"
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-ng-border px-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-ng-accent text-[11px] font-extrabold tracking-tight text-ng-accent-fg">
            NG
          </div>
          <p className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight text-ng-primary">
            Nexus-Grid
          </p>
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="flex h-8 w-8 items-center justify-center rounded-md text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-0.5">
              <p className="px-2.5 pb-1 text-ng-2xs font-bold uppercase tracking-[.8px] text-ng-secondary">
                {group.label}
              </p>
              {group.pages.map((item) => {
                const Icon = item.icon;
                const selected = page === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onNavigate(item.id);
                      onClose();
                    }}
                    aria-current={selected ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent",
                      selected
                        ? "bg-ng-accent-lit font-semibold text-ng-accent"
                        : "text-ng-secondary hover:bg-ng-bg hover:text-ng-primary"
                    )}
                  >
                    <Icon size={16} className={selected ? "opacity-100" : "opacity-70"} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 border-t border-ng-border px-4 py-3">
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
          <p className="truncate text-ng-xs font-semibold text-ng-primary">
            {health ? "System Online" : "Connecting…"}
          </p>
        </div>
      </div>
    </div>
  );
}
