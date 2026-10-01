'use client';

import type { ReactNode } from 'react';
import { cx } from '@/ui/primitives/cx';
import { Skeleton } from '@/ui/primitives/skeleton';

export function Table({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div className={cx('overflow-auto', className)}>
      <table className="w-full border-collapse text-left" aria-label={label}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  sortable = false,
  sorted,
  onSort,
  sticky = false,
}: {
  children: ReactNode;
  sortable?: boolean;
  sorted?: 'asc' | 'desc';
  onSort?: () => void;
  sticky?: boolean;
}) {
  const content = (
    <span className="inline-flex items-center gap-1">
      {children}
      {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : null}
    </span>
  );
  return (
    <th
      className={cx(
        'border-b border-line-1 bg-bg-2 px-3 text-left font-medium text-fg-3',
        sticky && 'sticky top-0',
      )}
      style={{ height: 'var(--row-h)' }}
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
    >
      {sortable ? (
        <button type="button" onClick={onSort} className="outline-none">
          {content}
        </button>
      ) : (
        content
      )}
    </th>
  );
}

export function Tr({
  children,
  selected = false,
}: {
  children: ReactNode;
  selected?: boolean;
}) {
  return (
    <tr
      className={cx(
        'border-b border-line-1 hover:bg-bg-3',
        selected && 'bg-orange-wash shadow-[inset_2px_0_0_var(--orange-500)]',
      )}
      style={{ height: 'var(--row-h)' }}
    >
      {children}
    </tr>
  );
}

export function Td({ children }: { children: ReactNode }) {
  return <td className="px-3">{children}</td>;
}

export function LoadingRows({ columns, rows = 3 }: { columns: number; rows?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} style={{ height: 'var(--row-h)' }}>
          {Array.from({ length: columns }, (_, column) => (
            <td key={column} className="px-3">
              <Skeleton />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}
