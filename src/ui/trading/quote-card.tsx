'use client';

import type { Pair } from '@/contracts/bill';
import type { QuoteSummary } from '@/contracts/airwallex';
import { D, formatDecimal } from '@/contracts/money';
import { formatMoney, formatPrice, PipNumber } from '@/ui/format';
import { Card } from '@/ui/primitives/card';
import { cx } from '@/ui/primitives/cx';
import { useRemaining } from '@/ui/trading/clock';
import { CountdownChip } from '@/ui/trading/countdown-chip';
import { DeltaText } from '@/ui/trading/delta-text';
import { KeyValueList } from '@/ui/trading/key-value-list';
import { formatUtcDate } from '@/ui/trading/time-label';

export function QuoteCard({
  quote,
  pair,
  tone,
  now,
  homeCurrency,
  fee,
}: {
  quote: QuoteSummary;
  pair: Pair;
  tone: 'target' | 'deadline' | 'expired' | 'near-miss';
  now: string;
  homeCurrency: string;
  fee?: string;
}) {
  const remaining = useRemaining(quote.validToAt, now);
  const expired = tone === 'expired' || remaining <= 0;
  const spread =
    quote.spreadBps !== undefined
      ? String(quote.spreadBps)
      : quote.midPrice
        ? formatDecimal(
            D(quote.price).minus(D(quote.midPrice)).div(D(quote.midPrice)).mul('10000'),
            1,
          )
        : undefined;
  return (
    <Card
      className={cx(
        'max-w-sm',
        tone === 'target' && !expired && 'glow-up',
        tone === 'deadline' && !expired && 'border-warn',
        tone === 'near-miss' && 'border-info',
        expired && 'opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label">{expired ? 'Expired' : tone === 'near-miss' ? 'Near miss' : 'Quote locked'}</p>
          <p className="mt-1">
            <PipNumber value={formatPrice(pair, quote.price)} className="text-lg" />
          </p>
        </div>
        <CountdownChip until={quote.validToAt} now={now} kind="quote" />
      </div>
      <div className="mt-3">
        <KeyValueList
          rows={[
            { label: 'You pay', value: formatMoney(homeCurrency, quote.sellAmount) },
            { label: 'Vendor receives', value: formatMoney(pair.base, quote.buyAmount) },
            ...(fee ? [{ label: 'Fee', value: formatMoney(homeCurrency, fee) }] : []),
            {
              label: 'Settles',
              value: formatUtcDate(quote.conversionDate, 'day-year'),
            },
            ...(spread
              ? [
                  {
                    label: 'Spread vs mid',
                    value: <DeltaText value={spread} mode="bps" />,
                  },
                ]
              : []),
            { label: 'Quote', value: <span className="num">{quote.airwallexQuoteId}</span> },
          ]}
        />
      </div>
      {expired ? <p className="mt-3 text-fg-2">re-quote</p> : null}
      {tone === 'near-miss' && !expired ? (
        <p className="mt-3 text-info">Price missed the target. Still watching.</p>
      ) : null}
    </Card>
  );
}
