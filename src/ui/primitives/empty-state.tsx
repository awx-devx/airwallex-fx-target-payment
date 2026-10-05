import type { ReactNode } from 'react';
import { EmptyChartMark } from '@/ui/primitives/empty-mark';

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 text-orange-500">{icon ?? <EmptyChartMark />}</div>
      <p className="font-medium">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-fg-2">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
