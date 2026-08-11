import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

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
    return <p className="px-5 py-4 text-sm text-ng-secondary">{empty}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((c) => (
            <TableHead key={c.label} className={cn(c.numeric && "text-right")}>
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, limit).map((row, i) => (
          <TableRow key={rowKey(row)} className={cn(i % 2 === 1 && "bg-ng-row-alt")}>
            {columns.map((c) => (
              <TableCell key={c.label} className={cn(c.numeric && "text-right tabular-nums")}>
                {c.render(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
