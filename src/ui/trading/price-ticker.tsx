'use client';

import type { Pair } from '@/contracts/bill';
import { D } from '@/contracts/money';
import { favorable } from '@/ui/format';
import { TrendingDown, TrendingUp, WifiOff } from 'lucide-react';
import { cx } from '@/ui/primitives/cx';
import { DeltaText } from '@/ui/trading/delta-text';
import { DIRECTION_TEXT } from '@/ui/trading/direction';
import { PairLabel } from '@/ui/trading/pair-label';
import { PriceDisplay } from '@/ui/trading/price-display';

export function PriceTicker({
  pair,
  price,
  entry,
  inverted = false,
  size = 'full',
  stale = false,
  disconnected = false,
}: {
  pair: Pair;
  price: string;
  entry?: string;
  inverted?: boolean;
  size?: 'compact' | 'full';
  stale?: boolean;
  disconnected?: boolean;
}) {
  const delta = entry ? D(price).minus(D(entry)).toString() : undefined;
  const direction = delta ? favorable(delta) : 'neutral';
  const Icon = delta && D(delta).isNegative() ? TrendingDown : TrendingUp;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-2',
        size === 'full' && 'flex-wrap',
        (stale || disconnected) && 'opacity-70',
      )}
    >
      <PairLabel pair={pair} inverted={inverted} size={size === 'compact' ? 'sm' : 'md'} />
      <PriceDisplay pair={pair} value={price} inverted={inverted} stale={stale} flash />
      {disconnected ? (
        <span className="inline-flex items-center gap-1 text-down">
          <WifiOff strokeWidth={1.5} className="size-3.5" />
          Disconnected
        </span>
      ) : delta ? (
        <span className={`inline-flex items-center gap-1 ${DIRECTION_TEXT[direction]}`}>
          {direction === 'neutral' ? null : (
            <Icon strokeWidth={1.5} className="size-3.5" />
          )}
          <DeltaText value={delta} pair={pair} />
        </span>
      ) : null}
    </span>
  );
}
