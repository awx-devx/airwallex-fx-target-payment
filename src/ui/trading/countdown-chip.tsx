'use client';

import { formatCountdown } from '@/ui/format';
import { useTimeFrozen } from '@/ui/motion/freeze';
import { cx } from '@/ui/primitives/cx';
import { easeInOut } from '@/ui/tokens/motion';
import { useRemaining } from '@/ui/trading/clock';
import { countdownUrgency } from '@/ui/trading/measure';
import { motion, useReducedMotion } from 'motion/react';

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
  const reduced = useReducedMotion();
  const frozen = useTimeFrozen();
  const ticking = urgency === 'urgent' && !reduced && !frozen;
  const body =
    urgency === 'expired'
      ? 'Expired'
      : kind === 'deadline'
        ? deadlineLabel(seconds)
        : formatCountdown(seconds);
  return (
    <motion.span
      className={cx(
        'num inline-flex h-5 origin-center items-center border px-2 text-[11px]',
        urgency === 'urgent' && 'border-warn text-warn',
        urgency === 'warn' && 'border-warn text-warn',
        urgency === 'expired' && 'border-line-2 text-fg-3',
        urgency === 'normal' && 'border-line-2 text-fg-1',
      )}
      animate={ticking ? { scale: [1, 1.03, 1] } : { scale: 1 }}
      transition={
        ticking
          ? { duration: 1, repeat: Infinity, ease: easeInOut }
          : { duration: 0 }
      }
    >
      {kind === 'autosettle' && urgency !== 'expired' ? `Pays at market ${body}` : body}
      {kind === 'autosettle' && urgency === 'expired' ? ' · cutoff passed' : ''}
    </motion.span>
  );
}

function deadlineLabel(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  if (days > 0) return `${days}d ${hours}h`;
  return formatCountdown(totalSeconds);
}
