'use client';

import type { BillSummary } from '@/contracts/bill';
import type { BillEvent } from '@/contracts/events';
import { useState } from 'react';
import { Banner } from '@/ui/primitives/banner';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
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
import { TransferTracker } from '@/ui/patterns/transfer-tracker';

export function BillTicket({
  bill,
  now,
  events,
  homeCurrency,
  cutoffLabel,
  notice,
  onAction,
  onSaveBankDetails,
}: {
  bill: BillSummary;
  now: string;
  events: readonly BillEvent[];
  homeCurrency: string;
  cutoffLabel: string;
  notice?: { tone: 'error' | 'warn' | 'info'; text: string };
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
                homeCurrency={homeCurrency}
                cutoffLabel={cutoffLabel}
                quoteId={quoteId}
                onAction={onAction}
              />
            ),
          },
          {
            value: 'details',
            label: 'Details',
            content: <Details bill={bill} onSaveBankDetails={onSaveBankDetails} />,
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
  homeCurrency,
  cutoffLabel,
  quoteId,
  onAction,
}: {
  bill: BillSummary;
  now: string;
  homeCurrency: string;
  cutoffLabel: string;
  quoteId?: string;
  onAction?: (action: string) => void;
}) {
  if (bill.state === 'READY') {
    if (!bill.allowedActions.includes('ARM')) {
      return (
        <p className="text-fg-2">
          Add the vendor's bank details on the Details tab before this bill can be armed.
        </p>
      );
    }
    return (
      <ArmConfirm
        bill={bill}
        cutoffLabel={cutoffLabel}
        onArm={() => onAction?.('ARM')}
      />
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

export interface BankDetailsInput {
  name: string;
  bankCountry: string;
  iban?: string;
  accountNumber?: string;
  bic?: string;
  localBankCode?: string;
}

function Details({
  bill,
  onSaveBankDetails,
}: {
  bill: BillSummary;
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
          country={BANK_COUNTRY[bill.pair.base] ?? ''}
          onSave={onSaveBankDetails}
        />
      ) : (
        <BeneficiaryCard beneficiary={bill.beneficiary} missing={bill.beneficiary ? [] : ['Bank details']} />
      )}
    </div>
  );
}

const BANK_COUNTRY: Record<string, string> = {
  EUR: 'DE',
  GBP: 'GB',
  JPY: 'JP',
  SGD: 'SG',
  INR: 'IN',
  USD: 'US',
  AUD: 'AU',
};

function BankDetailsForm({
  name,
  country,
  onSave,
}: {
  name: string;
  country: string;
  onSave: (input: BankDetailsInput) => void;
}) {
  const [accountName, setAccountName] = useState(name);
  const [bankCountry, setBankCountry] = useState(country);
  const [iban, setIban] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bic, setBic] = useState('');
  const [localBankCode, setLocalBankCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmedIban = iban.replaceAll(/\s+/g, '');
        const trimmedAccount = accountNumber.replaceAll(/\s+/g, '');
        if (bankCountry.trim().length !== 2) {
          setError('Bank country is a two-letter code.');
          return;
        }
        if (trimmedIban.length < 4 && trimmedAccount.length < 4) {
          setError('Enter an IBAN or an account number.');
          return;
        }
        setError(undefined);
        onSave({
          name: accountName.trim() || name,
          bankCountry: bankCountry.trim().toUpperCase(),
          ...(trimmedIban ? { iban: trimmedIban } : {}),
          ...(trimmedAccount ? { accountNumber: trimmedAccount } : {}),
          ...(bic.trim() ? { bic: bic.trim() } : {}),
          ...(localBankCode.trim() ? { localBankCode: localBankCode.trim() } : {}),
        });
      }}
    >
      <p className="text-fg-2">Save the vendor's bank account before this bill can be armed.</p>
      <Input aria-label="Account name" value={accountName} onChange={(event) => setAccountName(event.target.value)} />
      <Input
        aria-label="Bank country"
        value={bankCountry}
        maxLength={2}
        onChange={(event) => setBankCountry(event.target.value.toUpperCase())}
        placeholder="Country"
      />
      <Input aria-label="IBAN" value={iban} onChange={(event) => setIban(event.target.value)} placeholder="IBAN" />
      <Input
        aria-label="Account number"
        value={accountNumber}
        onChange={(event) => setAccountNumber(event.target.value)}
        placeholder="Account number"
      />
      <Input aria-label="BIC" value={bic} onChange={(event) => setBic(event.target.value)} placeholder="BIC" />
      <Input
        aria-label="Local bank code"
        value={localBankCode}
        onChange={(event) => setLocalBankCode(event.target.value)}
        placeholder="Sort code, IFSC, or bank code"
      />
      {error ? <p className="text-xs text-down">{error}</p> : null}
      <Button size="sm" type="submit">
        Save bank details
      </Button>
    </form>
  );
}
