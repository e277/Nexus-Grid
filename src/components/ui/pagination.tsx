"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "../../lib/utils";

/** Offered in every rows-per-page control, plus "All" for short lists. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

/**
 * A window onto a list, and the state that tracks it.
 *
 * `resetKey` exists because a page number only means something against the
 * list it was chosen for. When a filter narrows sixty rows to four, page three
 * is empty — so any input that changes what is being paged through belongs in
 * this key, and the window returns to the start.
 */
export function usePagination<T>(items: T[], initialPageSize: number, resetKey?: unknown) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // 0 is the "All" sentinel: one page holding everything.
  const effectiveSize = pageSize === 0 ? Math.max(1, items.length) : pageSize;
  const pageCount = Math.max(1, Math.ceil(items.length / effectiveSize));

  useEffect(() => {
    setPage(0);
  }, [resetKey, pageSize]);

  // Clamp rather than reset: a row removed from the last page should not throw
  // the reader back to the first.
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const pageItems = useMemo(
    () => items.slice(page * effectiveSize, page * effectiveSize + effectiveSize),
    [items, page, effectiveSize]
  );

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    pageItems,
    total: items.length,
    /** 1-based, for display. */
    from: items.length === 0 ? 0 : page * effectiveSize + 1,
    to: Math.min(items.length, (page + 1) * effectiveSize),
  };
}

/**
 * The control beneath a paged table.
 *
 * It states the window in full — "1–25 of 60" — rather than a page number
 * alone, because the count is the useful half: a reader wants to know how much
 * is there, not which arbitrary slice they are on.
 *
 * The rows-per-page control stays available whenever there is more than the
 * smallest option, even when the current size fits everything on one page —
 * otherwise choosing "All" would remove the control that let you choose it.
 */
export function Pagination({
  page,
  pageCount,
  pageSize,
  onPageSize,
  from,
  to,
  total,
  onPage,
  noun = "rows",
  className,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  onPageSize: (size: number) => void;
  from: number;
  to: number;
  total: number;
  onPage: (page: number) => void;
  noun?: string;
  className?: string;
}) {
  if (total <= PAGE_SIZES[0]) return null;

  return (
    <nav
      aria-label={`${noun} pagination`}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ng-border px-3 py-2",
        className
      )}
    >
      <span className="text-ng-2xs tabular-nums text-ng-secondary">
        {from}–{to} of {total} {noun}
      </span>

      <label className="flex items-center gap-1.5 text-ng-2xs text-ng-secondary">
        Rows
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="rounded-md border border-ng-border bg-ng-surface px-1.5 py-1 text-ng-2xs tabular-nums text-ng-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
        >
          {PAGE_SIZES.filter((size, i) => i === 0 || size < total * 2).map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
          <option value={0}>All</option>
        </select>
      </label>

      <span className="ml-auto flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 0}
          aria-label="Previous page"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-ng-border text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary disabled:opacity-40 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
        >
          <ChevronLeft size={14} />
        </button>

        <span className="px-1 text-ng-2xs tabular-nums text-ng-secondary">
          {page + 1} / {pageCount}
        </span>

        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount - 1}
          aria-label="Next page"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-ng-border text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary disabled:opacity-40 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
        >
          <ChevronRight size={14} />
        </button>
      </span>
    </nav>
  );
}
