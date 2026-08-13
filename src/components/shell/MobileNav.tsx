"use client";

import { cn } from "../../lib/utils";
import { findPage, MOBILE_TABS, type PageId } from "../../navigation";

/**
 * Three thumb-reachable destinations below the `lg` breakpoint, where the
 * sidebar is gone entirely.
 *
 * Deliberately not the full tree: a seven-item bar on a phone is a menu, and
 * the remaining pages are reachable from the ones here. The bar still marks
 * the current page when it is one of the other four, so the reader is never
 * shown a nav with nothing selected — the label just reads as inactive.
 */
export function MobileNav({
  page,
  onNavigate,
}: {
  page: PageId;
  onNavigate: (id: PageId) => void;
}) {
  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-20 grid shrink-0 grid-cols-2 border-t border-ng-border bg-ng-surface/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {MOBILE_TABS.map((tab) => {
        const target = findPage(tab.id);
        const Icon = target.icon;
        const selected = page === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-ng-2xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ng-accent",
              selected ? "text-ng-accent" : "text-ng-secondary"
            )}
          >
            <Icon size={18} />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
