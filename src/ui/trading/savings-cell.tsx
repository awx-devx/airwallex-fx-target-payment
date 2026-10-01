'use client';

import { D, decimalString } from '@/contracts/money';
import { favorable, formatDelta, formatMoney } from '@/ui/format';
import { useTween } from '@/ui/motion/hooks';
import { DIRECTION_TEXT } from '@/ui/trading/direction';

export function SavingsCell({
  currency,
  savings,
  savingsPct,
}: {
  currency: string;
  savings: string;
  savingsPct?: string;
}) {
  const tweened = useTween(savings);
  const direction = favorable(decimalString(D(tweened).negated()));
  return (
    <span className={`inline-flex items-baseline gap-2 ${DIRECTION_TEXT[direction]}`}>
      <span className="num">{formatMoney(currency, tweened, { signed: true })}</span>
      {savingsPct ? (
        <span className="num text-xs">{formatDelta(savingsPct, { mode: 'pct' })}</span>
      ) : null}
    </span>
  );
}
