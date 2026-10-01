'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/ui/primitives/cx';
import { fieldClass } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';

export function Input({
  size = 'md',
  error,
  prefix,
  suffix,
  icon,
  loading = false,
  forced = false,
  className,
  disabled,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> & {
  size?: 'sm' | 'md';
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  forced?: boolean;
}) {
  const invalid = Boolean(error);
  return (
    <label className="block">
      <span
        className={cx(
          'flex items-center gap-2 rounded-sm border bg-bg-2',
          'focus-within:border-line-3 focus-within:shadow-[var(--glow-sm)]',
          'data-[force=focus]:border-line-3 data-[force=focus]:shadow-[var(--glow-sm)]',
          invalid ? 'border-down' : 'border-line-2',
          (disabled || loading) && 'opacity-40',
          size === 'sm'
            ? 'h-[calc(var(--input-h)-4px)] px-2'
            : 'h-[var(--input-h)] px-2',
          className,
        )}
        data-force={forced ? 'focus' : undefined}
      >
        {loading ? <Spinner size="xs" /> : icon}
        {prefix ? <span className="text-fg-3">{prefix}</span> : null}
        <input
          disabled={disabled || loading}
          aria-invalid={invalid || undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-fg-1 outline-none placeholder:text-fg-4 read-only:text-fg-2"
          {...props}
        />
        {suffix ? <span className="text-fg-3">{suffix}</span> : null}
      </span>
      {error ? <span className="mt-1 block text-down">{error}</span> : null}
    </label>
  );
}

export { fieldClass };
