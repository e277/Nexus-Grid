"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { cn } from "../../lib/utils";
import { NAV_GROUPS, type PageId } from "../../navigation";
import type { Health } from "../../types";

interface SidebarProps {
  page: PageId;
  onNavigate: (id: PageId) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  health: Health | null;
}

/**
 * The rail collapses to icons at 60px and expands to 240px.
 *
 * Collapsed is a real mode, not a hidden sidebar: the icons stay clickable and
 * each carries its label as a `title`, so a narrow workspace loses the words
 * but not the navigation.
 */
export function Sidebar({
  page,
  onNavigate,
  collapsed,
  onToggleCollapsed,
  health,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-ng-border bg-ng-surface transition-[width] duration-200 lg:flex",
        collapsed ? "w-rail" : "w-sidebar"
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-ng-border",
          collapsed ? "justify-center px-2" : "gap-2.5 px-4"
        )}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-ng-accent text-[11px] font-extrabold tracking-tight text-ng-accent-fg">
          NG
        </div>
        {collapsed ? null : (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight tracking-tight text-ng-primary">
              Nexus-Grid
            </p>
            <p className="truncate text-ng-2xs font-medium uppercase tracking-wide text-ng-secondary">
              Caribbean food coordination
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-0.5">
            {collapsed ? (
              <div className="mx-auto mb-1.5 h-px w-6 bg-ng-border" aria-hidden />
            ) : (
              <p className="px-2.5 pb-1 text-ng-2xs font-bold uppercase tracking-[.8px] text-ng-secondary">
                {group.label}
              </p>
            )}
            {group.pages.map((item) => {
              const Icon = item.icon;
              const selected = page === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  aria-current={selected ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "relative flex w-full items-center rounded-md py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent",
                    collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
                    selected
                      ? "bg-ng-accent-lit font-semibold text-ng-accent"
                      : "text-ng-secondary hover:bg-ng-bg hover:text-ng-primary"
                  )}
                >
                  {selected ? (
                    <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-ng-accent" />
                  ) : null}
                  <Icon size={16} className={selected ? "opacity-100" : "opacity-70"} />
                  {collapsed ? (
                    <span className="sr-only">{item.label}</span>
                  ) : (
                    <span className="truncate">{item.label}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-2 border-t border-ng-border px-2 py-3">
        {/* System Online: the dot pulses only while the runtime is actually
            answering, so a dead backend reads as a still, grey dot rather
            than a reassuring animation. */}
        <div
          className={cn("flex items-center", collapsed ? "justify-center" : "gap-2 px-2")}
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
          {collapsed ? null : (
            <div className="min-w-0">
              <p className="truncate text-ng-xs font-semibold text-ng-primary">
                {health ? "System Online" : "Connecting…"}
              </p>
              <p className="truncate text-ng-2xs capitalize text-ng-secondary">
                {health ? `${health.version} · ${health.environment}` : "—"}
              </p>
            </div>
          )}
        </div>

        <button
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex h-8 items-center rounded-md text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent",
            collapsed ? "w-full justify-center" : "w-full gap-2 px-2.5 text-ng-xs font-medium"
          )}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          {collapsed ? null : "Collapse"}
        </button>
      </div>
    </aside>
  );
}
