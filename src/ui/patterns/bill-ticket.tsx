'use client';

import type { BillSummary } from '@/contracts/bill';
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
import { ArmConfirm } from '@/ui/patterns/arm-confirm';
import { BankDetailsForm, bankCountryFor, type BankDetailsInput } from '@/ui/patterns/bank-details-form';
import { TransferTracker } from '@/ui/patterns/transfer-tracker';

export function BillTicket({
  bill,
  now,
  events,
  homeCurrency,
  cutoffLabel,
  notice,
  pendingAction,
  savingBank = false,
  onAction,
  onSaveBankDetails,
}: {
  bill: BillSummary;
  now: string;
  events: readonly BillEvent[];
  homeCurrency: string;
  cutoffLabel: string;
  notice?: { tone: 'error' | 'warn' | 'info'; text: string };
  pendingAction?: string;
  savingBank?: boolean;
  onAction?: (action: string) => void;
  onSaveBankDetails?: (input: BankDetailsInput) => void;
}) {
  const needsBank =
    !bill.beneficiary && bill.allowedActions.includes('RESOLVE_BENEFICIARY');
  const [tab, setTab] = useState(needsBank ? 'details' : 'strategy');
  const mine = events.filter((event) => event.billId === bill.id);
  const quoteId = quoteIdOf(mine);
  return (
    <section className="space-y-3 bg-bg-0 p-3">
      <header className="flex flex-wrap items-center gap-2">
        <PairLabel pair={bill.pair} />
        <span className="text-fg-2">{bill.vendorName}</span>
        <MoneyDisplay currency={bill.pair.base} value={bill.amount} />
        <StateBadge state={bill.state} />
      </header>
      {notice ? <Banner tone={notice.tone}>{notice.text}</Banner> : null}
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
                events={mine}
                homeCurrency={homeCurrency}
                cutoffLabel={cutoffLabel}
                quoteId={quoteId}
                pendingAction={pendingAction}
                onAction={onAction}
              />
            ),
          },
          {
            value: 'details',
            label: 'Details',
            content: <Details bill={bill} savingBank={savingBank} onSaveBankDetails={onSaveBankDetails} />,
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

function armedOn(events: readonly BillEvent[], now: string): string {
  const armed = events.filter((event) => event.type === 'ARMED').sort((left, right) => right.ts.localeCompare(left.ts))[0];
  return armed ? armed.ts.slice(0, 10) : now.slice(0, 10);
}

function quoteIdOf(events: readonly BillEvent[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const value = events[index]?.payload?.quoteId;
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function StrategyBody({
  bill,
  now,
  events,
  homeCurrency,
  cutoffLabel,
  quoteId,
  pendingAction,
  onAction,
}: {
  bill: BillSummary;
  now: string;
  events: readonly BillEvent[];
  homeCurrency: string;
  cutoffLabel: string;
  quoteId?: string;
  pendingAction?: string;
  onAction?: (action: string) => void;
}) {
  if (bill.state === 'DRAFT') {
    return (
      <div className="space-y-3">
        <p className="text-fg-2">Review the invoice, then set a target and arm it.</p>
        <Button size="sm" loading={pendingAction === 'REVIEW'} onClick={() => onAction?.('REVIEW')}>
          Review bill
        </Button>
      </div>
    );
  }
  if (bill.state === 'READY') {
    if (!bill.allowedActions.includes('ARM')) {
      return (
        <p className="text-fg-2">
          Add the vendor bank details on the Details tab before this bill can be armed.
        </p>
      );
    }
    if (!bill.targetPrice) {
      return (
        <div className="space-y-3">
          <p className="text-fg-2">Set a target before this bill can be armed.</p>
          <Button size="sm" loading={pendingAction === 'EDIT_STRATEGY'} onClick={() => onAction?.('EDIT_STRATEGY')}>
            Set target
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <Button size="sm" variant="ghost" loading={pendingAction === 'EDIT_STRATEGY'} onClick={() => onAction?.('EDIT_STRATEGY')}>
          Edit target
        </Button>
        <ArmConfirm
          bill={bill}
          cutoffLabel={cutoffLabel}
          loading={pendingAction === 'ARM'}
          onArm={() => onAction?.('ARM')}
        />
      </div>
    );
  }
  if (bill.state === 'IN_FLIGHT' || bill.state === 'EXECUTING') {
    return bill.execution ? (
      <TransferTracker execution={bill.execution} quoteId={quoteId} />
    ) : (
      <p className="text-fg-3">Transfer not created yet.</p>
    );
  }
  if (bill.state === 'PAID') {
    return (
      <div className="space-y-2">
        <p className="text-up">Paid</p>
        {bill.execution ? <TransferTracker execution={bill.execution} quoteId={quoteId} /> : null}
      </div>
    );
  }
  if (bill.state === 'FAILED') {
    return (
      <div className="space-y-2">
        <Banner tone="error">{bill.execution?.failure?.message ?? 'The transfer failed.'}</Banner>
        {bill.execution ? <TransferTracker execution={bill.execution} quoteId={quoteId} /> : null}
        <Button size="sm" loading={pendingAction === 'RESOLVE_BENEFICIARY'} onClick={() => onAction?.('RESOLVE_BENEFICIARY')}>
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
        armedAt={armedOn(events, now)}
        now={now.slice(0, 10)}
        executeBy={bill.executionDeadline}
        due={bill.dueDate}
      />
      {bill.state === 'WATCHING' || bill.state === 'PAUSED' ? (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" loading={pendingAction === 'EDIT_STRATEGY'} onClick={() => onAction?.('EDIT_STRATEGY')}>
            Edit target
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={pendingAction === 'PAUSE' || pendingAction === 'RESUME'}
            onClick={() => onAction?.(bill.state === 'PAUSED' ? 'RESUME' : 'PAUSE')}
          >
            {bill.state === 'PAUSED' ? 'Resume' : 'Pause'}
          </Button>
          {bill.state === 'WATCHING' ? (
            <Button size="sm" variant="ghost" loading={pendingAction === 'PAY_NOW'} onClick={() => onAction?.('PAY_NOW')}>
              Pay now
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Details({
  bill,
  savingBank = false,
  onSaveBankDetails,
}: {
  bill: BillSummary;
  savingBank?: boolean;
  onSaveBankDetails?: (input: BankDetailsInput) => void;
}) {
  const canAdd =
    !bill.beneficiary &&
    bill.allowedActions.includes('RESOLVE_BENEFICIARY') &&
    onSaveBankDetails !== undefined;
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
          ...(bill.safetyNetTransferId
            ? [{ label: 'Safety net', value: bill.safetyNetTransferId }]
            : []),
        ]}
      />
      {canAdd ? (
        <BankDetailsForm
          name={bill.vendorName}
          country={bankCountryFor(bill.pair.base)}
          saving={savingBank}
          onSave={onSaveBankDetails}
        />
      ) : (
        <BeneficiaryCard beneficiary={bill.beneficiary} missing={bill.beneficiary ? [] : ['Bank details']} />
      )}
    </div>
  );
}
