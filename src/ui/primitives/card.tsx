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
        variant === 'raised' && 'bg-bg-2 shadow-[var(--shadow-panel)]',
        variant === 'glow-border' && 'glow-border',
        interactive && 'transition-shadow hover:shadow-[var(--glow-sm)]',
        selected && 'bg-orange-wash shadow-[var(--glow-sm)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
