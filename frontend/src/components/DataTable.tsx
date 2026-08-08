import type { ReactNode } from "react";

export interface Column<T> {
  label: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  empty?: string;
  limit?: number;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty = "Nothing here yet.",
  limit = 10,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <p className="py-2 text-sm text-ng-secondary">{empty}</p>;
  }
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-ng-border bg-ng-bg">
          {columns.map((c) => (
            <th
              key={c.label}
              className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-[.6px] text-ng-secondary ${c.numeric ? "text-right" : "text-left"}`}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, limit).map((row, i) => (
          <tr
            key={rowKey(row)}
            className={`border-b border-ng-border transition-colors last:border-0 hover:bg-ng-accent-lit ${i % 2 === 1 ? "bg-ng-row-alt" : ""}`}
          >
            {columns.map((c) => (
              <td
                key={c.label}
                className={`h-12 px-4 align-middle text-[13px] text-ng-primary ${c.numeric ? "text-right tabular-nums" : ""}`}
              >
                {c.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
