import type { Pair } from '@/contracts/bill';
import { formatPair } from '@/ui/format';
import { Flag } from '@/ui/primitives/flag';
import { cx } from '@/ui/primitives/cx';

const SIZE = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
} as const;

export function PairLabel({
  pair,
  inverted = false,
  size = 'md',
  payoutOnly = false,
}: {
  pair: Pair;
  inverted?: boolean;
  size?: keyof typeof SIZE;
  payoutOnly?: boolean;
}) {
  const flag = size === 'lg' ? 20 : 16;
  return (
    <span className={cx('inline-flex items-center gap-1.5', SIZE[size])}>
      <span className="inline-flex">
        <Flag currency={inverted ? pair.quote : pair.base} size={flag} />
        <Flag currency={inverted ? pair.base : pair.quote} size={flag} />
      </span>
      <span className="font-medium">{formatPair(pair, { inverted })}</span>
      {payoutOnly ? <span className="text-fg-3">Payout only</span> : null}
    </span>
  );
}
