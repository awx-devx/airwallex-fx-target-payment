'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/ui/primitives/cx';
import { Spinner } from '@/ui/primitives/spinner';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'outline'
  | 'danger'
  | 'success'
  | 'link';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';
export type ForcedState = 'hover' | 'active' | 'focus';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-orange-500 text-bg-0 hover:bg-orange-600 data-[force=hover]:bg-orange-600 active:bg-orange-600 data-[force=active]:bg-orange-600',
  secondary:
    'border border-line-2 bg-bg-2 text-fg-1 hover:border-line-3 hover:bg-bg-3 data-[force=hover]:border-line-3 data-[force=hover]:bg-bg-3',
  ghost:
    'text-fg-1 hover:bg-bg-3 data-[force=hover]:bg-bg-3 active:bg-bg-2 data-[force=active]:bg-bg-2',
  outline:
    'border border-line-2 text-fg-1 hover:border-line-3 hover:bg-bg-2 data-[force=hover]:border-line-3 data-[force=hover]:bg-bg-2',
  danger:
    'bg-down text-bg-0 hover:brightness-110 data-[force=hover]:brightness-110',
  success:
    'bg-up text-bg-0 hover:brightness-110 data-[force=hover]:brightness-110',
  link: 'h-auto px-0 text-orange-300 underline-offset-2 hover:underline data-[force=hover]:underline',
};

const SIZE: Record<ButtonSize, string> = {
  xs: 'h-6 gap-1 px-2 text-[11px]',
  sm: 'h-7 gap-1.5 px-2.5 text-xs',
  md: 'h-[var(--input-h)] gap-1.5 px-3 text-[13px]',
  lg: 'h-[calc(var(--input-h)+8px)] gap-2 px-4 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  forced,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  forced?: ForcedState;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      data-force={forced}
      className={cx(
        'inline-flex items-center justify-center rounded-sm font-medium whitespace-nowrap',
        'outline-none focus-visible:shadow-[var(--glow-sm)] data-[force=focus]:shadow-[var(--glow-sm)]',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANT[variant],
        variant === 'link' ? 'h-auto px-0' : SIZE[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size={size === 'lg' ? 'md' : 'xs'} /> : icon}
      {children}
      {iconRight}
    </button>
  );
}
