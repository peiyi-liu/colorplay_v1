import type { ReactNode } from 'react';

type DataTableProps = Readonly<{
  caption: string;
  columns: readonly { key: string; header: string }[];
  rows: readonly Record<string, ReactNode>[];
}>;

/** 標準資料表：可捲動容器＋語意化表格（教師看板／報表）。 */
export function DataTable({ caption, columns, rows }: DataTableProps) {
  return (
    <div className="ui-table-scroll">
      <table className="ui-table" aria-label={caption}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column.key}>{row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
