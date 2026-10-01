import type { Pair } from '@/contracts/bill';
import { roundToPayout } from '@/contracts/currencies';
import { D } from '@/contracts/money';
import { formatMoney, formatPrice, PipNumber } from '@/ui/format';
import { DeltaText } from '@/ui/trading/delta-text';

export function CrosshairTooltip({
  pair,
  price,
  inverted = false,
  entry,
  target,
  timeLabel,
  notional,
}: {
  pair: Pair;
  price: string;
  inverted?: boolean;
  entry?: string;
  target?: string;
  timeLabel: string;
  notional?: { amount: string; currency: string };
}) {
  const cost = notional
    ? formatMoney(
        notional.currency,
        roundToPayout(notional.currency, D(notional.amount).mul(D(price)).toString()),
      )
    : undefined;
  return (
    <div className="pointer-events-none rounded-lg border border-line-2 bg-bg-2 px-2 py-1.5 text-[12px]">
      <p className="text-fg-3">{timeLabel}</p>
      <p className="mt-1">
        <PipNumber value={formatPrice(pair, price, { inverted })} />
      </p>
      {entry ? (
        <p className="mt-1 flex justify-between gap-4">
          <span className="text-fg-3">Δ entry</span>
          <DeltaText value={D(price).minus(D(entry)).toString()} pair={pair} />
        </p>
      ) : null}
      {target ? (
        <p className="flex justify-between gap-4">
          <span className="text-fg-3">Δ target</span>
          <DeltaText value={D(price).minus(D(target)).toString()} pair={pair} />
        </p>
      ) : null}
      {cost ? (
        <p className="mt-1 flex justify-between gap-4">
          <span className="text-fg-3">Cost</span>
          <span className="num">{cost}</span>
        </p>
      ) : null}
    </div>
  );
}

export function DragPreview({
  pair,
  price,
  inverted = false,
  cost,
}: {
  pair: Pair;
  price: string;
  inverted?: boolean;
  cost?: string;
}) {
  return (
    <div className="pointer-events-none rounded-lg border border-orange-500 bg-bg-2 px-2 py-1 text-[12px]">
      <PipNumber value={formatPrice(pair, price, { inverted })} />
      {cost ? <p className="num text-fg-2">{cost}</p> : null}
    </div>
  );
}
