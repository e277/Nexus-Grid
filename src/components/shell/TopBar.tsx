"use client";

import { Bell, ChevronRight, Menu } from "lucide-react";

import { cn } from "../../lib/utils";
import { findPage, groupOf, type PageId } from "../../navigation";
import type { AgentActivity, Health } from "../../types";
import { ThemeToggle } from "../ThemeToggle";
import { Badge } from "../ui/badge";

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

interface TopBarProps {
  page: PageId;
  health: Health | null;
  recentActivity: AgentActivity[] | null;
  unreadCount: number;
  notifOpen: boolean;
  onToggleNotifications: () => void;
  onCloseNotifications: () => void;
  onOpenMenu: () => void;
}

export function TopBar({
  page,
  health,
  recentActivity,
  unreadCount,
  notifOpen,
  onToggleNotifications,
  onCloseNotifications,
  onOpenMenu,
}: TopBarProps) {
  const active = findPage(page);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-ng-border bg-ng-surface/85 px-4 backdrop-blur-md sm:gap-3 sm:px-6">
      <button
        onClick={onOpenMenu}
        aria-label="Open navigation"
        className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent lg:hidden"
      >
        <Menu size={17} />
      </button>

      {/* Breadcrumb: the group, then the page. Two segments is the whole tree,
          so there is nothing to truncate on a phone but the group. */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1 text-sm">
        <span className="hidden shrink-0 text-ng-secondary sm:inline">Nexus-Grid</span>
        <ChevronRight size={13} className="hidden shrink-0 text-ng-border sm:block" aria-hidden />
        <span className="hidden shrink-0 text-ng-secondary md:inline">{groupOf(page)}</span>
        <ChevronRight size={13} className="hidden shrink-0 text-ng-border md:block" aria-hidden />
        <span aria-current="page" className="truncate font-semibold text-ng-primary">
          {active.title}
        </span>
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        {health ? (
          <Badge variant="success" className="hidden sm:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ng-success" />
            {health.status === "ok" ? "All systems operational" : health.status}
          </Badge>
        ) : (
          <span className="hidden text-ng-xs text-ng-secondary sm:inline">Connecting…</span>
        )}

        <ThemeToggle />

        <div className="relative z-30">
          <button
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
            aria-expanded={notifOpen}
            onClick={onToggleNotifications}
            className="relative flex h-8 w-8 items-center justify-center rounded-md border border-ng-border bg-ng-surface text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
          >
            <Bell size={15} />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-ng-danger px-1 text-[9px] font-bold text-white">
                {unreadCount}
              </span>
            ) : null}
          </button>

          {notifOpen ? (
            <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-[10px] border border-ng-border bg-ng-surface shadow-ng-md">
              <div className="border-b border-ng-border px-4 py-2.5">
                <p className="text-sm font-semibold text-ng-primary">Recent agent activity</p>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {recentActivity === null ? (
                  <p className="px-4 py-4 text-sm text-ng-secondary">
                    Agent activity is unavailable.
                  </p>
                ) : recentActivity.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-ng-secondary">No agent activity yet.</p>
                ) : (
                  recentActivity.map((a) => (
                    <div key={a.id} className="border-b border-ng-border px-4 py-2.5 last:border-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-ng-xs text-ng-accent">{a.agent_name}</span>
                        <span className="text-ng-2xs text-ng-secondary">
                          {timeAgo(a.created_at)}
                        </span>
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
        <div
          className={cn("fixed inset-0 z-20")}
          aria-hidden
          onClick={onCloseNotifications}
        />
      ) : null}
    </header>
  );
}
