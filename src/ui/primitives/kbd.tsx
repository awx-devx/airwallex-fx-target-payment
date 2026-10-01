import type { ReactNode } from 'react';
import { cx } from '@/ui/primitives/cx';

export function Kbd({
  children,
  size = 'sm',
}: {
  children: ReactNode;
  size?: 'xs' | 'sm';
}) {
  const keys = Array.isArray(children) ? children : [children];
  return (
    <span className="inline-flex items-center gap-0.5">
      {keys.map((key, index) => (
        <kbd
          key={index}
          className={cx(
            'inline-flex items-center rounded-xs border border-line-2 bg-bg-3 font-sans text-fg-2',
            size === 'xs' ? 'h-4 px-1 text-[10px]' : 'h-5 px-1.5 text-[11px]',
          )}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
