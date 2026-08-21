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
 * The only navigation, at every width.
 *
 * One surface for one list of links, rather than a rail, a drawer and a tab
 * bar to keep in step.
 *
 * The rail is visible at every width. Below `lg` it is the 60px icon strip,
 * which is cheap enough to keep on a phone and puts every destination one tap
 * away. From `lg` it honours the operator's collapse preference and shows
 * labels.
 *
 * The responsive half is CSS, not a breakpoint read in JavaScript: labels are
 * rendered at every width and hidden by class. Reading the viewport in JS would
 * resolve only after mount, which means a first paint with the wrong layout.
 */
export function Sidebar({
  page,
  onNavigate,
  collapsed,
  onToggleCollapsed,
  health,
}: SidebarProps) {
  /** Hidden while the rail is icons-only: always under `lg`, and above it when collapsed. */
  const wordsOnly = cn("hidden", collapsed ? "" : "lg:block");

  return (
    <aside
      className={cn(
        "flex w-rail shrink-0 flex-col border-r border-ng-border/60 bg-ng-surface transition-[width] duration-200",
        collapsed ? "lg:w-rail" : "lg:w-sidebar"
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-ng-border/50 px-2",
          collapsed ? "justify-center" : "justify-center lg:justify-start lg:gap-2.5 lg:px-4"
        )}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-ng-accent text-[11px] font-extrabold tracking-tight text-ng-accent-fg">
          NG
        </div>
        <div className={cn("min-w-0", wordsOnly)}>
          <p className="truncate text-sm font-bold leading-tight tracking-tight text-ng-primary">
            Nexus-Grid
          </p>
          <p className="truncate text-ng-2xs font-medium uppercase tracking-wide text-ng-secondary">
            Caribbean food coordination
          </p>
        </div>
      </div>

      {/* Runtime status and the rail toggle share one row. The dot pulses only
          while the runtime is actually answering, so a dead backend reads as a
          still, grey dot rather than a reassuring animation. */}
      <div
        className={cn(
          "flex shrink-0 items-center border-b border-ng-border/50 px-2 py-2.5",
          collapsed ? "justify-center" : "justify-center lg:justify-start lg:gap-2"
        )}
      >
        <span
          className={cn("flex min-w-0 items-center", collapsed ? "" : "lg:flex-1 lg:gap-2 lg:px-1")}
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
          <span className={cn("min-w-0", wordsOnly)}>
            <span className="block truncate text-ng-xs font-semibold text-ng-primary">
              {health ? "System Online" : "Connecting…"}
            </span>
            <span className="block truncate text-ng-2xs capitalize text-ng-secondary">
              {health ? `${health.version} · ${health.environment}` : "—"}
            </span>
          </span>
        </span>

        {/* Collapsing is a desktop affordance: below `lg` the rail is already
            at its narrowest, so the control would toggle nothing. */}
        {collapsed ? null : (
          <button
            onClick={onToggleCollapsed}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent lg:flex"
          >
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>

      {collapsed ? (
        <button
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="hidden h-8 shrink-0 items-center justify-center border-b border-ng-border/50 text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent lg:flex"
        >
          <PanelLeftOpen size={15} />
        </button>
      ) : null}

      <nav aria-label="Primary" className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-0.5">
            {/* The group reads as a heading where there is room for words and
                as a rule where there is not. Either way the groups stay
                separated, which is the work the label is doing. */}
            <div
              className={cn("mx-auto mb-1.5 h-px w-6 bg-ng-border", collapsed ? "" : "lg:hidden")}
              aria-hidden
            />
            <p
              className={cn(
                "px-2.5 pb-1 text-ng-2xs font-bold uppercase tracking-[.8px] text-ng-secondary",
                wordsOnly
              )}
            >
              {group.label}
            </p>
            {group.pages.map((item) => {
              const Icon = item.icon;
              const selected = page === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  aria-current={selected ? "page" : undefined}
                  title={item.label}
                  className={cn(
                    // 44px tall on the icon rail: a nav that lives on a phone
                    // needs a thumb-sized target, not a 28px desktop row.
                    "relative flex w-full items-center rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent",
                    collapsed
                      ? "h-11 justify-center px-0"
                      : "h-11 justify-center px-0 lg:h-auto lg:justify-start lg:gap-2.5 lg:px-2.5 lg:py-1.5",
                    selected
                      ? "bg-ng-accent-lit font-semibold text-ng-accent"
                      : "text-ng-secondary hover:bg-ng-bg hover:text-ng-primary"
                  )}
                >
                  {selected ? (
                    <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-ng-accent" />
                  ) : null}
                  <Icon size={18} className={cn("lg:size-4", selected ? "opacity-100" : "opacity-70")} />
                  <span className={cn("truncate", wordsOnly)}>{item.label}</span>
                  {/* The label stays in the accessibility tree at every width;
                      only its visual presence is responsive. */}
                  <span className={cn("sr-only", collapsed ? "" : "lg:hidden")}>{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
