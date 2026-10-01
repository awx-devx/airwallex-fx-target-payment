'use client';

import type { BillSummary, Role } from '@/contracts/bill';
import type { BillEvent } from '@/contracts/events';
import { useState } from 'react';
import { Banner } from '@/ui/primitives/banner';
import { Button } from '@/ui/primitives/button';
import { Tabs } from '@/ui/primitives/tabs';
import { ActivityItem } from '@/ui/trading/activity-item';
import { BeneficiaryCard } from '@/ui/trading/beneficiary-card';
import { DeadlineMeter } from '@/ui/trading/deadline-meter';
import { KeyValueList } from '@/ui/trading/key-value-list';
import { MoneyDisplay } from '@/ui/trading/money-display';
import { PairLabel } from '@/ui/trading/pair-label';
import { StateBadge } from '@/ui/trading/state-badge';
import { StrategySummary } from '@/ui/trading/strategy-summary';
import { formatUtcDate } from '@/ui/trading/time-label';
import { ApprovalCard } from '@/ui/patterns/approval-card';
import { ArmConfirm } from '@/ui/patterns/arm-confirm';
import { TransferTracker } from '@/ui/patterns/transfer-tracker';

export function BillTicket({
  bill,
  now,
  events,
  role = 'preparer',
  homeCurrency,
  cutoffLabel,
  onAction,
}: {
  bill: BillSummary;
  now: string;
  events: readonly BillEvent[];
  role?: Role;
  homeCurrency: string;
  cutoffLabel: string;
  onAction?: (action: string) => void;
}) {
  const [tab, setTab] = useState('strategy');
  const mine = events.filter((event) => event.billId === bill.id);
  return (
    <section className="space-y-3 bg-bg-0 p-3">
      <header className="flex flex-wrap items-center gap-2">
        <PairLabel pair={bill.pair} />
        <span className="text-fg-2">{bill.vendorName}</span>
        <MoneyDisplay currency={bill.pair.base} value={bill.amount} />
        <StateBadge state={bill.state} />
      </header>
      <Tabs
        value={tab}
        onValueChange={setTab}
        size="sm"
        tabs={[
          {
            value: 'strategy',
            label: 'Strategy',
            content: (
              <StrategyBody
                bill={bill}
                now={now}
                role={role}
                homeCurrency={homeCurrency}
                cutoffLabel={cutoffLabel}
                onAction={onAction}
              />
            ),
          },
          {
            value: 'details',
            label: 'Details',
            content: <Details bill={bill} />,
          },
          {
            value: 'activity',
            label: 'Activity',
            count: mine.length,
            content: (
              <div className="space-y-2">
                {mine.length === 0 ? (
                  <p className="text-fg-3">No activity yet.</p>
                ) : (
                  mine.map((event) => <ActivityItem key={event.id} event={event} />)
                )}
              </div>
            ),
          },
        ]}
      />
    </section>
  );
}

function StrategyBody({
  bill,
  now,
  role,
  homeCurrency,
  cutoffLabel,
  onAction,
}: {
  bill: BillSummary;
  now: string;
  role: Role;
  homeCurrency: string;
  cutoffLabel: string;
  onAction?: (action: string) => void;
}) {
  if (bill.state === 'READY') {
    return (
      <ArmConfirm
        bill={bill}
        cutoffLabel={cutoffLabel}
        onArm={() => onAction?.('ARM')}
      />
    );
  }
  if (bill.state === 'TARGET_HIT' || bill.state === 'DEADLINE_WINDOW') {
    return (
      <div className="space-y-3">
        <DeadlineMeter
          armedAt="2026-09-20"
          now={now.slice(0, 10)}
          executeBy={bill.executionDeadline}
          due={bill.dueDate}
          finalDay={bill.state === 'DEADLINE_WINDOW'}
        />
        <ApprovalCard bill={bill} now={now} role={role} homeCurrency={homeCurrency} onApprove={() => onAction?.('APPROVE')} onHold={() => onAction?.('HOLD')} onCancel={() => onAction?.('CANCEL')} />
      </div>
    );
  }
  if (bill.state === 'IN_FLIGHT' || bill.state === 'EXECUTING' || bill.state === 'APPROVED') {
    return bill.execution ? (
      <TransferTracker execution={bill.execution} />
    ) : (
      <p className="text-fg-3">Transfer not created yet.</p>
    );
  }
  if (bill.state === 'PAID') {
    return (
      <div className="space-y-2">
        <p className="text-up">Paid</p>
        {bill.execution ? <TransferTracker execution={bill.execution} /> : null}
      </div>
    );
  }
  if (bill.state === 'FAILED') {
    return (
      <div className="space-y-2">
        <Banner tone="error">{bill.execution?.failure?.message ?? 'The transfer failed.'}</Banner>
        {bill.execution ? <TransferTracker execution={bill.execution} /> : null}
        <Button size="sm" onClick={() => onAction?.('RESOLVE_BENEFICIARY')}>
          Fix and re-arm
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <StrategySummary
        pair={bill.pair}
        mode={bill.strategyMode}
        targetPrice={bill.targetPrice}
        maxCost={bill.maxCost}
        homeCurrency={homeCurrency}
      />
      <DeadlineMeter
        armedAt="2026-09-20"
        now={now.slice(0, 10)}
        executeBy={bill.executionDeadline}
        due={bill.dueDate}
      />
      {bill.state === 'WATCHING' || bill.state === 'PAUSED' ? (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => onAction?.(bill.state === 'PAUSED' ? 'RESUME' : 'PAUSE')}>
            {bill.state === 'PAUSED' ? 'Resume' : 'Pause'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction?.('PAY_NOW')}>
            Pay now
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Details({ bill }: { bill: BillSummary }) {
  return (
    <div className="space-y-3">
      <KeyValueList
        rows={[
          { label: 'Invoice', value: bill.invoiceNumber },
          { label: 'Reference', value: bill.reference },
          { label: 'Reason', value: bill.transferReason.replaceAll('_', ' ') },
          { label: 'Method', value: bill.transferMethod },
          { label: 'Execute by', value: formatUtcDate(bill.executionDeadline, 'day') },
          { label: 'Due', value: formatUtcDate(bill.dueDate, 'day') },
        ]}
      />
      <BeneficiaryCard beneficiary={bill.beneficiary} missing={bill.beneficiary ? [] : ['Bank details']} />
    </div>
  );
}
