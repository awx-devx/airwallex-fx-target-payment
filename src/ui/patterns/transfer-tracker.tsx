'use client';

import type { ExecutionSummary } from '@/contracts/airwallex';
import type { ReactNode } from 'react';
import { formatMoney } from '@/ui/format';
import { CopyId } from '@/ui/trading/copy-id';
import { KeyValueList } from '@/ui/trading/key-value-list';
import { transferNextStep } from '@/ui/trading/measure';
import { TransferStatusPill } from '@/ui/trading/transfer-status-pill';
import { formatUtcDate } from '@/ui/trading/time-label';

export function TransferTracker({
  execution,
  quoteId,
  advance,
  lateFailure = false,
}: {
  execution: ExecutionSummary;
  quoteId?: string;
  advance?: ReactNode;
  lateFailure?: boolean;
}) {
  const funding = execution.funding;
  const showFunding = funding && funding.status !== 'FUNDED';
  const category = execution.failure?.category;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TransferStatusPill status={execution.status} category={category} lateFailure={lateFailure} />
        {advance}
      </div>
      <CopyId value={execution.shortReferenceId} prominent />
      <KeyValueList
        rows={[
          { label: 'Transfer', value: <CopyId value={execution.transferId} /> },
          ...(quoteId ? [{ label: 'Quote', value: <CopyId value={quoteId} /> }] : []),
          { label: 'Quote request', value: <span className="num text-xs">{execution.requestId}</span> },
          {
            label: 'You pay',
            value: formatMoney(execution.sourceCurrency, execution.sourceAmount),
          },
          {
            label: 'Vendor receives',
            value: formatMoney(execution.transferCurrency, execution.transferAmount),
          },
          {
            label: 'Amounts',
            value: execution.amountsTentative ? 'Tentative' : 'Confirmed',
          },
          {
            label: 'Dispatch',
            value: execution.dispatchDate ? formatUtcDate(execution.dispatchDate, 'day') : '—',
          },
        ]}
      />
      {showFunding ? (
        <p className="text-[13px] text-warn">
          Funding {funding.status.replaceAll('_', ' ').toLowerCase()}
          {funding.failureReason ? ` · ${funding.failureReason}` : ''}
        </p>
      ) : null}
      {lateFailure ? (
        <p className="text-[13px] text-down">Failed after it was marked paid.</p>
      ) : null}
      {category ? <p className="text-[13px] text-fg-1">{transferNextStep(category)}</p> : null}
      {execution.failure?.message ? (
        <p className="text-xs text-fg-3">{execution.failure.message}</p>
      ) : null}
    </div>
  );
}
