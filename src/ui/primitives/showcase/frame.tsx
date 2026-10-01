import type { ReactNode } from 'react';
import { cx } from '@/ui/primitives/cx';

export function Matrix({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-4">{children}</div>;
}

export function Cell({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('min-w-36 space-y-1', className)}>
      <p className="label">{label}</p>
      {children}
    </div>
  );
}
