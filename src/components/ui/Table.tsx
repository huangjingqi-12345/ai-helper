import type { ReactNode } from 'react';
import { clsx } from 'clsx';

interface Column<T> {
  key: string;
  header?: string;
  title?: string;
  width?: string;
  render?: (record: T, index: number) => ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: keyof T | ((record: T) => string);
  loading?: boolean;
  onRowClick?: (record: T) => void;
  className?: string;
}

export function Table<T extends object>({
  columns,
  data,
  rowKey,
  onRowClick,
  className,
}: TableProps<T>): JSX.Element {
  const getRowKey = (record: T, index: number): string => {
    if (typeof rowKey === 'function') return rowKey(record);
    return String(record[rowKey] ?? index);
  };

  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider"
                style={{ width: col.width }}
              >
                {col.header || col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((record, index) => (
            <tr
              key={getRowKey(record, index)}
              className={clsx(
                'border-b border-border/50 hover:bg-bg-tertiary/50 transition-colors duration-100',
                onRowClick && 'cursor-pointer'
              )}
              onClick={() => onRowClick?.(record)}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-sm text-text-secondary">
                  {col.render
                    ? col.render(record, index)
                    : String((record as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
