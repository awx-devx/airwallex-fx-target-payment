'use client';

import type { BalanceSummary } from '@/contracts/airwallex';
import { formatMoney } from '@/ui/format';
import { cx } from '@/ui/primitives/cx';
import { Tooltip } from '@/ui/primitives/tooltip';

export function BalancePill({
  balance,
  tone = 'normal',
}: {
  balance: BalanceSummary;
  tone?: 'normal' | 'low' | 'insufficient';
}) {
  return (
    <Tooltip
      title={`${balance.currency} wallet`}
      content={
        <span className="grid gap-0.5">
          <span>Pending {formatMoney(balance.currency, balance.pending)}</span>
          <span>Reserved {formatMoney(balance.currency, balance.reserved)}</span>
          <span>Total {formatMoney(balance.currency, balance.total)}</span>
        </span>
      }
    >
      <button
        type="button"
        className={cx(
          'num inline-flex h-6 items-center border px-2 text-xs',
          tone === 'insufficient' && 'border-down text-down',
          tone === 'low' && 'border-warn text-warn',
          tone === 'normal' && 'border-line-2 text-fg-1',
        )}
      >
        {formatMoney(balance.currency, balance.available)}
      </button>
    </Tooltip>
  );
}
