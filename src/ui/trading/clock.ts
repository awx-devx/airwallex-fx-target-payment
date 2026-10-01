'use client';

import { useTimeFrozen } from '@/ui/motion/freeze';
import { useEffect, useState } from 'react';
import { secondsBetween } from '@/ui/trading/measure';

/**
 * Seconds from `now` until `until`. While the kit clock runs, the window
 * counts down from that gap. Freeze time keeps the original gap.
 */
export function useRemaining(until: string, now: string): number {
  const frozen = useTimeFrozen();
  const base = secondsBetween(now, until);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (frozen) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [frozen]);

  return frozen ? base : base - elapsed;
}
