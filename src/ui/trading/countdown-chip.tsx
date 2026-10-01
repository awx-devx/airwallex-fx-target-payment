'use client';

import { formatCountdown } from '@/ui/format';
import { cx } from '@/ui/primitives/cx';
import { useRemaining } from '@/ui/trading/clock';
import { countdownUrgency } from '@/ui/trading/measure';

export function CountdownChip({
  until,
  now,
  kind = 'quote',
}: {
  until: string;
  now: string;
  kind?: 'quote' | 'deadline' | 'autosettle';
}) {
  const seconds = useRemaining(until, now);
  const urgency = countdownUrgency(seconds);
  const body =
    urgency === 'expired'
      ? 'Expired'
      : kind === 'deadline'
        ? deadlineLabel(seconds)
        : formatCountdown(seconds);
  return (
    <span
      className={cx(
        'num inline-flex h-5 items-center border px-2 text-[11px]',
        urgency === 'urgent' && 'border-down text-down glow-pulse',
        urgency === 'warn' && 'border-warn text-warn',
        urgency === 'expired' && 'border-line-2 text-fg-3',
        urgency === 'normal' && 'border-line-2 text-fg-1',
      )}
    >
      {kind === 'autosettle' && urgency !== 'expired' ? `Auto-settles ${body}` : body}
      {kind === 'autosettle' && urgency === 'expired' ? ' · cutoff passed' : ''}
    </span>
  );
}

function deadlineLabel(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  if (days > 0) return `${days}d ${hours}h`;
  return formatCountdown(totalSeconds);
}
