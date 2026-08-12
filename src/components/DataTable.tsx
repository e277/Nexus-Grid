"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { cn } from "../lib/utils";
import { Input } from "./ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

export interface Column<T> {
  label: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
  /**
   * Value this column sorts and searches on. Supply it to make the header
   * sortable — a column with only a `render` is display-only, because a
   * ReactNode has no defensible ordering.
   */
  sortValue?: (row: T) => string | number | null | undefined;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  empty?: string;
  /** Rows per page. Pagination only appears once there is a second page. */
  pageSize?: number;
  /** Show the search field. Off for short, fixed tables where it is noise. */
  searchable?: boolean;
  searchPlaceholder?: string;
}

type SortDirection = "asc" | "desc";

function compare(a: string | number | null | undefined, b: string | number | null | undefined) {
  // Nulls sort last in both directions — an absent value is not "smallest".
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * The shared table: search, sortable headers, striped rows, pagination.
 *
 * Sorting and searching both run off `sortValue`, so a column is searchable
 * exactly when it is sortable and there is never a column the filter silently
 * ignores.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty = "Nothing here yet.",
  pageSize = 10,
  searchable = true,
  searchPlaceholder = "Search…",
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ index: number; direction: SortDirection } | null>(null);
  const [page, setPage] = useState(0);

  const searchable_ = searchable && columns.some((c) => c.sortValue);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      columns.some((column) => {
        const value = column.sortValue?.(row);
        return value !== null && value !== undefined
          ? String(value).toLowerCase().includes(needle)
          : false;
      })
    );
  }, [rows, columns, query]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const column = columns[sort.index];
    if (!column?.sortValue) return filtered;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort(
      (a, b) => compare(column.sortValue!(a), column.sortValue!(b)) * factor
    );
  }, [filtered, columns, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);

  function toggleSort(index: number) {
    setPage(0);
    setSort((prev) =>
      prev?.index === index
        ? prev.direction === "asc"
          ? { index, direction: "desc" }
          : null
        : { index, direction: "asc" }
    );
  }

  return (
    <div>
      {searchable_ ? (
        <div className="flex items-center gap-2 border-b border-ng-border px-4 py-2.5">
          <div className="relative w-full max-w-xs">
            <Search
              size={13}
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ng-disabled"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="pl-7"
            />
          </div>
          <span className="ml-auto shrink-0 text-ng-2xs tabular-nums text-ng-secondary">
            {sorted.length === rows.length
              ? `${rows.length} rows`
              : `${sorted.length} of ${rows.length}`}
          </span>
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ng-secondary">
          {query ? `No rows match “${query}”.` : empty}
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((column, index) => {
                  const active = sort?.index === index;
                  const Icon = !column.sortValue
                    ? null
                    : !active
                      ? ChevronsUpDown
                      : sort.direction === "asc"
                        ? ArrowUp
                        : ArrowDown;

                  return (
                    <TableHead
                      key={column.label}
                      aria-sort={
                        active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined
                      }
                      className={cn(column.numeric && "text-right", "p-0")}
                    >
                      {column.sortValue ? (
                        <button
                          onClick={() => toggleSort(index)}
                          className={cn(
                            "flex w-full items-center gap-1 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[.6px] transition-colors hover:text-ng-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ng-accent",
                            column.numeric && "justify-end",
                            active ? "text-ng-primary" : "text-ng-secondary"
                          )}
                        >
                          {column.label}
                          {Icon ? (
                            <Icon
                              size={11}
                              aria-hidden
                              className={active ? "opacity-100" : "opacity-40"}
                            />
                          ) : null}
                        </button>
                      ) : (
                        <span
                          className={cn(
                            "block px-4 py-2.5",
                            column.numeric && "text-right"
                          )}
                        >
                          {column.label}
                        </span>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row, i) => (
                <TableRow key={rowKey(row)} className={cn(i % 2 === 1 && "bg-ng-row-alt")}>
                  {columns.map((column) => (
                    <TableCell
                      key={column.label}
                      className={cn(column.numeric && "text-right tabular-nums")}
                    >
                      {column.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pageCount > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-ng-border px-4 py-2.5">
              <p className="text-ng-2xs tabular-nums text-ng-secondary">
                {current * pageSize + 1}–{Math.min((current + 1) * pageSize, sorted.length)} of{" "}
                {sorted.length}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage(current - 1)}
                  disabled={current === 0}
                  className="rounded-md border border-ng-border px-2 py-1 text-ng-2xs font-semibold text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary disabled:pointer-events-none disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
                >
                  Previous
                </button>
                <span className="px-1 text-ng-2xs tabular-nums text-ng-secondary">
                  {current + 1} / {pageCount}
                </span>
                <button
                  onClick={() => setPage(current + 1)}
                  disabled={current >= pageCount - 1}
                  className="rounded-md border border-ng-border px-2 py-1 text-ng-2xs font-semibold text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary disabled:pointer-events-none disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
