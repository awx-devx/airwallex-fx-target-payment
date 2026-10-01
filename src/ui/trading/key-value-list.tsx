import type { ReactNode } from 'react';

export function KeyValueList({
  rows,
}: {
  rows: ReadonlyArray<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
      {rows.map((row) => (
        <div key={row.label} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-fg-3">{row.label}</dt>
          <dd className="min-w-0 text-right text-fg-1">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
