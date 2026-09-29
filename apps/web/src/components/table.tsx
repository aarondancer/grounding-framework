import { createColumnHelper, flexRender, tableFeatures, useTable } from "@tanstack/react-table";
import type { ReactNode } from "react";

const features = tableFeatures({});

export type Col<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
};

/**
 * Thin table wrapper (TanStack Table v9). Server-side pagination lives in the
 * route loaders (cursor `after` param); this renders one page of rows.
 */
export function DataTable<T extends Record<string, unknown>>({
  rows,
  cols,
  keyOf,
}: {
  rows: T[];
  cols: Col<T>[];
  keyOf?: (row: T) => string;
}) {
  const helper = createColumnHelper<typeof features, T>();
  const table = useTable({
    features,
    data: rows,
    columns: helper.columns(
      cols.map((c) =>
        helper.display({
          id: c.key,
          header: c.header,
          cell: (i) => c.cell(i.row.original),
        }),
      ),
    ),
    ...(keyOf ? { getRowId: (r: T) => keyOf(r) } : {}),
  });

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id} className="border-b border-zinc-200 text-left">
            {hg.headers.map((h) => (
              <th key={h.id} className="py-1.5 pr-4 font-medium text-zinc-500">
                {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} className="border-b border-zinc-100 last:border-0">
            {row.getAllCells().map((cell) => (
              <td key={cell.id} className="py-1.5 pr-4 align-top">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
