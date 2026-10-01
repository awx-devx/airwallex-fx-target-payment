'use client';

import { X } from 'lucide-react';
import { cx } from '@/ui/primitives/cx';

export function Chip({
  children,
  selected = false,
  onRemove,
  onClick,
}: {
  children: string;
  selected?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
}) {
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs',
        selected
          ? 'border-orange-500 bg-orange-wash text-orange-300 shadow-[var(--glow-sm)]'
          : 'border-line-2 bg-bg-2 text-fg-2',
      )}
    >
      {onClick ? (
        <button type="button" onClick={onClick} className="outline-none">
          {children}
        </button>
      ) : (
        children
      )}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${children}`}
          onClick={onRemove}
          className="text-fg-3 outline-none hover:text-fg-1"
        >
          <X strokeWidth={1.5} className="size-3" />
        </button>
      ) : null}
    </span>
  );
}
