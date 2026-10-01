import type { Pair } from '@/contracts/bill';
import { D } from '@/contracts/money';
import { formatDelta, formatPrice } from '@/ui/format';
import { cx } from '@/ui/primitives/cx';
import { distanceToTarget } from '@/ui/trading/measure';

const FILL = {
  far: 'bg-fg-3',
  mid: 'bg-fg-2',
  near: 'bg-warn',
  through: 'bg-orange-500',
} as const;

const TEXT = {
  far: 'text-fg-2',
  mid: 'text-fg-1',
  near: 'text-warn',
  through: 'text-orange-300',
} as const;

export function DistanceToTarget({
  pair,
  price,
  target,
  inverted = false,
  compact = false,
}: {
  pair: Pair;
  price: string;
  target: string;
  inverted?: boolean;
  compact?: boolean;
}) {
  const { band, ratio } = distanceToTarget(price, target);
  const label = band === 'through' ? 'Through target' : `${formatDelta(ratio, { mode: 'pct' })} from target`;
  if (compact) return <p className="truncate text-fg-3">{label}</p>;
  const scaled = D(ratio).abs().mul('800');
  const width = band === 'through' ? 100 : Math.min(100, scaled.toNumber());
  return (
    <div className="w-full max-w-xs">
      <div className="flex items-baseline justify-between gap-3">
        <p className={TEXT[band]}>{label}</p>
        <p className="num text-fg-3">
          {formatPrice(pair, price, { inverted })}
        </p>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-3">
        <div className={cx('h-full rounded-full', FILL[band])} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
