'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/ui/primitives/cx';
import type { ForcedState } from '@/ui/primitives/button';
import { Tooltip } from '@/ui/primitives/tooltip';

export type IconButtonVariant = 'ghost' | 'secondary' | 'primary';
export type IconButtonSize = 'xs' | 'sm' | 'md';

const SIZE: Record<IconButtonSize, string> = {
  xs: 'size-6',
  sm: 'size-7',
  md: 'size-[var(--input-h)]',
};

const VARIANT: Record<IconButtonVariant, string> = {
  ghost: 'text-fg-1 hover:bg-bg-3 data-[force=hover]:bg-bg-3',
  secondary:
    'border border-line-2 bg-bg-2 text-fg-1 hover:border-line-3 data-[force=hover]:border-line-3',
  primary: 'bg-orange-500 text-bg-0 hover:bg-orange-600 data-[force=hover]:bg-orange-600',
};

export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  tooltip,
  badge = false,
  forced,
  className,
  children,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  tooltip?: ReactNode;
  badge?: boolean;
  forced?: ForcedState;
}) {
  const button = (
    <button
      type={type}
      aria-label={label}
      data-force={forced}
      className={cx(
        'relative inline-flex items-center justify-center rounded-sm outline-none',
        'focus-visible:shadow-[var(--glow-sm)] data-[force=focus]:shadow-[var(--glow-sm)]',
        'disabled:pointer-events-none disabled:opacity-40',
        SIZE[size],
        VARIANT[variant],
        className,
      )}
      {...props}
    >
      {children}
      {badge ? (
        <span
          aria-hidden
          className="absolute top-1 right-1 size-1.5 rounded-full bg-orange-500"
        />
      ) : null}
    </button>
  );
  if (!tooltip) return button;
  return <Tooltip content={tooltip}>{button}</Tooltip>;
}
