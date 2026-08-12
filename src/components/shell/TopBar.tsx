"use client";

import { ChevronRight, Menu } from "lucide-react";

import { findPage, groupOf, type PageId } from "../../navigation";
import type { Health } from "../../types";
import { ThemeToggle } from "../ThemeToggle";
import { Badge } from "../ui/badge";

interface TopBarProps {
  page: PageId;
  health: Health | null;
  onOpenMenu: () => void;
}

export function TopBar({ page, health, onOpenMenu }: TopBarProps) {
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
      </div>
    </header>
  );
}
