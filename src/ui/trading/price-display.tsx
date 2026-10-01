'use client';

import type { Pair } from '@/contracts/bill';
import { formatPrice, PipNumber } from '@/ui/format';
import { useTickFlash } from '@/ui/motion/hooks';
import { Odometer } from '@/ui/trading/odometer';
import { Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { cx } from '@/ui/primitives/cx';

export function PriceDisplay({
  pair,
  value,
  inverted = false,
  size = 'inline',
  stale = false,
  flash = false,
}: {
  pair: Pair;
  value: string;
  inverted?: boolean;
  size?: 'inline' | 'hero' | 'axis';
  stale?: boolean;
  flash?: boolean;
}) {
  const formatted = formatPrice(pair, value, { inverted });
  const tick = useTickFlash(value);
  return (
    <span
      className={cx(
        'relative inline-flex items-center gap-1.5',
        stale && 'text-fg-3',
        size === 'hero' && 'display-lg',
        size === 'axis' && 'text-[11px]',
      )}
    >
      {flash ? (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-sm"
          style={{ backgroundColor: tick.backgroundColor, opacity: tick.opacity }}
        />
      ) : null}
      <span className="relative">
        {size === 'hero' ? (
          <Odometer value={formatted} />
        ) : (
          <PipNumber value={formatted} />
        )}
      </span>
      {stale ? (
        <Clock strokeWidth={1.5} className="relative size-3.5 text-fg-3" aria-label="Stale" />
      ) : null}
    </span>
  );
}
