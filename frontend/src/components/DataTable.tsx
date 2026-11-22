import type { ReactNode } from 'react';
import { EmptyState } from './feedback';
export interface DataColumn<T> { key: string; header: string; cell: (row: T) => ReactNode }
export function DataTable<T>({ caption, columns, rows, rowKey, onRowClick, emptyTitle = 'No records yet', emptyDescription = 'Records will appear here when available.' }: {
  caption: string; columns: DataColumn<T>[]; rows: T[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void; emptyTitle?: string; emptyDescription?: string;
}) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto rounded-lg border bg-card">
    <table className="w-full text-left text-sm"><caption className="sr-only">{caption}</caption>
      <thead className="border-b bg-muted/50 text-xs text-muted-foreground"><tr>{columns.map(column => <th key={column.key} scope="col" className="px-5 py-3 font-medium">{column.header}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={rowKey(row)} className={onRowClick ? 'cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40' : 'border-b last:border-0'} onClick={event => {
        if (event.target instanceof Element && event.target.closest('a, button, input, select, textarea')) return;
        if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !window.getSelection()?.toString()) onRowClick?.(row);
      }}>{columns.map(column => <td key={column.key} className="px-5 py-4">{column.cell(row)}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}
