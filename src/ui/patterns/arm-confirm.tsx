'use client';

import type { BillSummary } from '@/contracts/bill';
import { D } from '@/contracts/money';
import { formatMoney, formatPrice } from '@/ui/format';
import { useState } from 'react';
import { Banner } from '@/ui/primitives/banner';
import { Button } from '@/ui/primitives/button';
import { Checkbox } from '@/ui/primitives/choice';
import { formatUtcDate } from '@/ui/trading/time-label';

export function ArmConfirm({
  bill,
  cutoffLabel,
  consent,
  onConsentChange,
  onArm,
}: {
  bill: BillSummary;
  cutoffLabel: string;
  consent?: boolean;
  onConsentChange?: (consent: boolean) => void;
  onArm?: () => void;
}) {
  const [local, setLocal] = useState(false);
  const checked = consent ?? local;
  const alreadyMet =
    bill.lastPrice !== undefined &&
    bill.targetPrice !== undefined &&
    D(bill.lastPrice).lte(D(bill.targetPrice));
  function setChecked(next: boolean | 'indeterminate') {
    const value = next === true;
    setLocal(value);
    onConsentChange?.(value);
  }
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-fg-2">
        {bill.vendorName} · {formatMoney(bill.pair.base, bill.amount)}
        {bill.targetPrice ? ` · target ${formatPrice(bill.pair, bill.targetPrice)}` : ''}
      </p>
      <p className="text-[13px] text-fg-2">
        Execute by {formatUtcDate(bill.executionDeadline, 'day')} · due{' '}
        {formatUtcDate(bill.dueDate, 'day')}
      </p>
      {alreadyMet ? (
        <Banner tone="warn">The target is already met. Arming will pay at the current rate.</Banner>
      ) : null}
      {/* DEMO-ONLY: consent is one checkbox. PROD: a stored payment mandate. */}
      <Checkbox
        checked={checked}
        onCheckedChange={setChecked}
        label={`If the target is not hit by ${cutoffLabel}, pay at market`}
      />
      {!checked ? <p className="text-xs text-down">Standing instruction is required.</p> : null}
      <Button disabled={!checked} onClick={onArm}>
        Arm bill
      </Button>
    </div>
  );
}
