"use client";

import { ChevronRight } from "lucide-react";

import { findPage, groupOf, type PageId } from "../../navigation";
import { ThemeToggle } from "../ThemeToggle";

interface TopBarProps {
  page: PageId;
}

export function TopBar({ page }: TopBarProps) {
  const active = findPage(page);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-ng-border/15 bg-ng-surface/85 px-4 backdrop-blur-md sm:gap-3 sm:px-6">

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

      {/* Runtime health lives in the rail, next to the version and
          environment it qualifies. Saying it twice on one screen made two
          indicators that could disagree and neither of which was the one to
          trust. */}
      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
