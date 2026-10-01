'use client';

import type { ReactNode } from 'react';
import { cx } from '@/ui/primitives/cx';

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  variant = 'pill',
  size = 'md',
  label,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<{
    value: T;
    label: string;
    disabled?: boolean;
  }>;
  variant?: 'pill' | 'underline';
  size?: 'sm' | 'md';
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        'inline-flex',
        variant === 'pill'
          ? 'rounded-sm border border-line-2 bg-bg-1 p-0.5'
          : 'gap-3 border-b border-line-1',
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cx(
              'rounded-xs font-medium outline-none focus-visible:shadow-[var(--glow-sm)]',
              'disabled:pointer-events-none disabled:opacity-40',
              size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-xs',
              variant === 'underline' &&
                '-mb-px rounded-none border-b-2 border-transparent',
              selected
                ? variant === 'pill'
                  ? 'bg-bg-3 text-fg-1'
                  : 'border-orange-500 text-fg-1'
                : 'text-fg-3 hover:text-fg-1',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ButtonGroup({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-sm border border-line-2 [&>button]:rounded-none [&>button]:border-0 [&>button:not(:last-child)]:border-r [&>button:not(:last-child)]:border-line-2"
    >
      {children}
    </div>
  );
}
