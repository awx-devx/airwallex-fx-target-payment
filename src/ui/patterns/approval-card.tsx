'use client';

import type { BillSummary, Role } from '@/contracts/bill';
import { formatMoney, formatPrice } from '@/ui/format';
import { Banner } from '@/ui/primitives/banner';
import { Button } from '@/ui/primitives/button';
import { Kbd } from '@/ui/primitives/kbd';
import { CostBreakdown } from '@/ui/trading/cost-breakdown';
import { QuoteCard } from '@/ui/trading/quote-card';
import { SavingsCell } from '@/ui/trading/savings-cell';
import { formatUtcDate } from '@/ui/trading/time-label';

export function ApprovalCard({
  bill,
  now,
  role = 'approver',
  approving = false,
  homeCurrency,
  onApprove,
  onHold,
  onCancel,
}: {
  bill: BillSummary;
  now: string;
  role?: Role;
  approving?: boolean;
  homeCurrency: string;
  onApprove?: () => void;
  onHold?: () => void;
  onCancel?: () => void;
}) {
  const approval = bill.activeApproval;
  if (!approval) return <p className="text-fg-3">No approval is open.</p>;
  const quote = approval.quote;
  const expired = approval.status === 'EXPIRED';
  const approved = approval.status === 'APPROVED';
  const tone = expired ? 'expired' : approval.kind === 'DEADLINE' ? 'deadline' : 'target';
  const readOnly = role === 'preparer' && !approved;
  return (
    <div className="max-w-md space-y-3">
      <QuoteCard quote={quote} pair={bill.pair} tone={tone} now={now} homeCurrency={homeCurrency} />
      <CostBreakdown
        pair={bill.pair}
        billAmount={bill.amount}
        billCurrency={bill.pair.base}
        price={quote.price}
        homeCurrency={homeCurrency}
        entryPrice={bill.entryPrice}
        targetPrice={bill.targetPrice}
        mode={approved ? 'locked' : 'tentative'}
      />
      {bill.entryPrice ? (
        <p className="flex items-center justify-between text-[13px]">
          <span className="text-fg-3">Vs entry {formatPrice(bill.pair, bill.entryPrice)}</span>
          <SavingsCell
            currency={homeCurrency}
            savings={bill.savings ?? '0'}
            savingsPct={bill.savingsPct}
          />
        </p>
      ) : null}
      {bill.flags.insufficientBalance ? (
        <Banner tone="error">
          Not enough {homeCurrency}. Available balance is below {formatMoney(homeCurrency, quote.sellAmount)}.
        </Banner>
      ) : null}
      {approval.trigger?.simulated ? (
        <p className="text-xs text-orange-300">
          Triggered at {formatPrice(bill.pair, approval.trigger.price)} (simulated) · Airwallex quote{' '}
          {formatPrice(bill.pair, quote.price)} (actual)
        </p>
      ) : null}
      {approval.autoApproved ? (
        <p className="text-xs text-orange-300">Auto-approved by the simulation.</p>
      ) : null}
      {approval.autosettleAt ? (
        <p className="text-xs text-fg-3">
          Auto-settles {formatUtcDate(approval.autosettleAt, 'day-time')} if nobody approves.
        </p>
      ) : null}
      {readOnly ? (
        <p className="text-fg-2">Waiting for an approver.</p>
      ) : approved ? (
        <p className="text-up">Approved</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            loading={approving}
            disabled={expired || bill.flags.insufficientBalance}
            onClick={onApprove}
            iconRight={<Kbd>A</Kbd>}
          >
            Approve
          </Button>
          <Button variant="secondary" onClick={onHold} iconRight={<Kbd>H</Kbd>}>
            Hold for better
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel bill
          </Button>
        </div>
      )}
    </div>
  );
}
