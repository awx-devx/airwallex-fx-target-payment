'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/ui/primitives/cx';

const TONE = {
  info: 'border-info text-info',
  warn: 'border-warn text-warn',
  error: 'border-down text-down',
  'demo-mode': 'border-orange-500 bg-orange-wash text-orange-300',
} as const;

export function Banner({
  tone,
  children,
  onDismiss,
}: {
  tone: keyof typeof TONE;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="status"
      className={cx(
        'flex items-start justify-between gap-3 rounded-sm border px-3 py-2',
        TONE[tone],
      )}
    >
      <p>{children}</p>
      {onDismiss ? (
        <button type="button" aria-label="Dismiss" onClick={onDismiss} className="text-fg-3">
          <X strokeWidth={1.5} className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
