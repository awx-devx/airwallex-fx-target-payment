'use client';

import { Progress as ProgressPrimitive } from 'radix-ui';
import { cx } from '@/ui/primitives/cx';

export function ProgressBar({
  value,
  tone = 'orange',
  indeterminate = false,
  segments,
  label = 'Progress',
}: {
  value?: number;
  tone?: 'orange' | 'up' | 'warn';
  indeterminate?: boolean;
  segments?: ReadonlyArray<{ done: boolean }>;
  label?: string;
}) {
  const fill = tone === 'up' ? 'bg-up' : tone === 'warn' ? 'bg-warn' : 'bg-orange-500';
  if (segments) {
    return (
      <div role="progressbar" aria-label={label} className="flex gap-1">
        {segments.map((segment, index) => (
          <span
            key={index}
            className={cx('h-1.5 flex-1 rounded-full', segment.done ? fill : 'bg-bg-3')}
          />
        ))}
      </div>
    );
  }
  if (indeterminate) {
    return (
      <div
        role="progressbar"
        aria-label={label}
        className="h-1.5 overflow-hidden rounded-full bg-bg-3"
      >
        <span className={cx('skeleton block h-full w-1/3 rounded-full', fill)} />
      </div>
    );
  }
  return (
    <ProgressPrimitive.Root
      value={value}
      aria-label={label}
      className="relative h-1.5 overflow-hidden rounded-full bg-bg-3"
    >
      <ProgressPrimitive.Indicator
        className={cx('h-full', fill)}
        style={{ width: `${value ?? 0}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
