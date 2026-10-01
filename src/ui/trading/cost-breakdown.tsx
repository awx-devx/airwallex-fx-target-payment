import type { Pair } from '@/contracts/bill';
import { roundToPayout } from '@/contracts/currencies';
import { D } from '@/contracts/money';
import { formatMoney, formatPrice, PipNumber } from '@/ui/format';
import { DeltaText } from '@/ui/trading/delta-text';
import { KeyValueList } from '@/ui/trading/key-value-list';

export function CostBreakdown({
  pair,
  billAmount,
  billCurrency,
  price,
  homeCurrency,
  fee,
  swiftChargeOption,
  total,
  vendorReceives,
  invoiceAmount,
  entryPrice,
  targetPrice,
  mode = 'estimated',
  feeUnknown = false,
}: {
  pair: Pair;
  billAmount: string;
  billCurrency: string;
  price: string;
  homeCurrency: string;
  fee?: { amount: string; currency: string; paidBy: 'PAYER' | 'BENEFICIARY' };
  swiftChargeOption?: 'SHARED' | 'PAYER';
  total?: string;
  vendorReceives?: string;
  invoiceAmount?: string;
  entryPrice?: string;
  targetPrice?: string;
  mode?: 'estimated' | 'tentative' | 'locked';
  feeUnknown?: boolean;
}) {
  const notional = roundToPayout(homeCurrency, D(billAmount).mul(D(price)).toString());
  const youPay = total ?? notional;
  const short =
    vendorReceives &&
    invoiceAmount &&
    D(vendorReceives).lessThan(D(invoiceAmount));
  const muted = mode === 'tentative';
  return (
    <div className={muted ? 'text-fg-3' : undefined}>
      <p className="label mb-2">
        {mode === 'locked' ? 'Locked' : mode === 'tentative' ? 'Tentative' : 'Estimated'}
      </p>
      <KeyValueList
        rows={[
          {
            label: 'Bill',
            value: formatMoney(billCurrency, billAmount),
          },
          {
            label: 'Price',
            value: <PipNumber value={formatPrice(pair, price)} />,
          },
          {
            label: mode === 'locked' ? 'You pay' : 'Notional',
            value: formatMoney(homeCurrency, youPay),
          },
          {
            label: fee ? (fee.paidBy === 'PAYER' ? 'Fee · you pay' : 'Fee · vendor pays') : 'Fee',
            value: feeUnknown
              ? 'Fee not known yet'
              : fee
                ? formatMoney(fee.currency, fee.amount)
                : '—',
          },
          ...(vendorReceives
            ? [
                {
                  label: 'Vendor receives',
                  value: (
                    <span className={short ? 'text-warn' : undefined}>
                      {formatMoney(billCurrency, vendorReceives)}
                      {short ? ' · less than the invoice' : ''}
                    </span>
                  ),
                },
              ]
            : []),
          ...(entryPrice
            ? [
                {
                  label: 'Vs entry',
                  value: (
                    <DeltaText value={D(price).minus(D(entryPrice)).toString()} pair={pair} />
                  ),
                },
              ]
            : []),
          ...(targetPrice
            ? [
                {
                  label: 'Vs target',
                  value: (
                    <DeltaText value={D(price).minus(D(targetPrice)).toString()} pair={pair} />
                  ),
                },
              ]
            : []),
        ]}
      />
      {swiftChargeOption ? (
        <p className="mt-2 text-fg-2">
          {swiftChargeOption === 'PAYER'
            ? 'SWIFT charges: paid by you'
            : 'SWIFT charges: shared'}
        </p>
      ) : null}
      {mode === 'tentative' ? (
        <p className="mt-2 text-fg-3">Tentative until Airwallex schedules the transfer.</p>
      ) : null}
    </div>
  );
}
