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
    return <p className="text-sm text-slate-400">{empty}</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
          {columns.map((c) => (
            <th key={c.label} className="pb-2 pr-4">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.slice(0, limit).map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((c) => (
              <td
                key={c.label}
                className={`py-2 pr-4 text-slate-700 ${c.numeric ? "tabular-nums" : ""}`}
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
