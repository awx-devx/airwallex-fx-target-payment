import type { ReactNode } from 'react';
import { cx } from '@/ui/primitives/cx';

export function Card({
  children,
  variant = 'flat',
  interactive = false,
  selected = false,
  className,
}: {
  children: ReactNode;
  variant?: 'flat' | 'raised' | 'glow-border';
  interactive?: boolean;
  selected?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'rounded-md border border-line-1 p-4',
        variant === 'flat' && 'bg-bg-1',
        variant === 'raised' && 'bg-bg-2',
        variant === 'glow-border' && 'glow-border',
        interactive && 'hover:bg-bg-2',
        selected && 'border-orange-500 bg-orange-wash',
        className,
      )}
    >
      {children}
    </div>
  );
}
