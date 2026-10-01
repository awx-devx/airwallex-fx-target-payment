import type { ReactNode } from 'react';
import { cx } from '@/ui/primitives/cx';

export type BadgeTone =
  | 'neutral'
  | 'orange'
  | 'up'
  | 'down'
  | 'warn'
  | 'info'
  | 'muted';
export type BadgeStyle = 'solid' | 'soft' | 'outline';

const SOFT: Record<BadgeTone, string> = {
  neutral: 'bg-bg-3 text-fg-1',
  orange: 'bg-orange-wash text-orange-300',
  up: 'bg-up-wash text-up',
  down: 'bg-down-wash text-down',
  warn: 'bg-warn-wash text-warn',
  info: 'bg-bg-3 text-info',
  muted: 'bg-bg-3 text-muted',
};

const SOLID: Record<BadgeTone, string> = {
  neutral: 'bg-fg-2 text-bg-0',
  orange: 'bg-orange-500 text-bg-0',
  up: 'bg-up text-bg-0',
  down: 'bg-down text-bg-0',
  warn: 'bg-warn text-bg-0',
  info: 'bg-info text-bg-0',
  muted: 'bg-muted text-bg-0',
};

const OUTLINE: Record<BadgeTone, string> = {
  neutral: 'border-line-2 text-fg-1',
  orange: 'border-orange-500 text-orange-300',
  up: 'border-up text-up',
  down: 'border-down text-down',
  warn: 'border-warn text-warn',
  info: 'border-info text-info',
  muted: 'border-muted text-muted',
};

export function Badge({
  tone = 'neutral',
  appearance = 'soft',
  size = 'sm',
  dot = false,
  pulse = false,
  children,
}: {
  tone?: BadgeTone;
  appearance?: BadgeStyle;
  size?: 'xs' | 'sm';
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
}) {
  const palette =
    appearance === 'solid' ? SOLID : appearance === 'outline' ? OUTLINE : SOFT;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
        appearance === 'outline' && 'border',
        size === 'xs' ? 'h-4 px-1.5 text-[10px]' : 'h-5 px-2 text-[11px]',
        palette[tone],
      )}
    >
      {dot ? (
        <span
          aria-hidden
          className={cx(
            'size-1.5 rounded-full bg-current',
            pulse && 'glow-pulse',
          )}
        />
      ) : null}
      {children}
    </span>
  );
}
