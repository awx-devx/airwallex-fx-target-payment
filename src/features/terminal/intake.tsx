'use client';

import type { TransferReason } from '@/contracts/airwallex';
import type { StrategyMode } from '@/contracts/bill';
import { D, significantPrice } from '@/contracts/money';
import { useBill, useBillActions, useChart } from '@/features/data/hooks';
import { useState } from 'react';
import { StrategyWizardStep } from '@/ui/patterns/strategy-wizard';
import { ExtractionReview } from '@/ui/patterns/extraction-review';
import { ArmConfirm } from '@/ui/patterns/arm-confirm';
import { Button } from '@/ui/primitives/button';
import { Dialog } from '@/ui/primitives/dialog';
import { Input } from '@/ui/primitives/input';
import { TransferMethodPicker } from '@/ui/primitives/transfer-method-picker';
import type { TransferMethodOption } from '@/ui/primitives/transfer-method';
import { formatUtcDate } from '@/ui/trading/time-label';

const METHODS: readonly TransferMethodOption[] = [
  { method: 'LOCAL', flightTime: { min: 'P0D', max: 'P1D' } },
  { method: 'SWIFT', flightTime: { min: 'P1D', max: 'P3D' } },
];

/** Review the scanned fields, then set the target and the pay-by date. */
export function BillIntake({
  ids,
  open,
  cutoffLabel,
  onOpenChange,
  onFinished,
  onError,
}: {
  ids: readonly string[];
  open: boolean;
  cutoffLabel: string;
  onOpenChange: (open: boolean) => void;
  onFinished: (id: string) => void;
  onError: (error: unknown) => void;
}) {
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<'review' | 'strategy'>('review');
  const [seen, setSeen] = useState('');
  const [reason, setReason] = useState<TransferReason>('bill_payment');
  const [reference, setReference] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [mode, setMode] = useState<StrategyMode>('TARGET_RATE');
  const [target, setTarget] = useState('');
  const [maxCost, setMaxCost] = useState('');
  const id = ids[index];
  const billQuery = useBill(open ? id : undefined);
  const chart = useChart(step === 'strategy' ? id : undefined, 'TO_DUE');
  const actions = useBillActions();
  const bill = billQuery.data;

  if (bill && seen !== bill.id) {
    setSeen(bill.id);
    setStep(bill.state === 'DRAFT' ? 'review' : 'strategy');
    setReason(bill.transferReason);
    setReference(bill.reference ?? bill.invoiceNumber);
    setDueDate(bill.dueDate);
    setMode(bill.strategyMode ?? 'TARGET_RATE');
    setTarget(bill.targetPrice ?? (bill.lastPrice ? offsetTarget(bill.lastPrice, '0.01') : ''));
    setMaxCost(bill.maxCost ?? '');
  }

  async function saveReview() {
    if (!bill) return;
    try {
      await actions.patch(bill.id, {
        transferReason: reason,
        reference,
        ...(dueDate !== bill.dueDate ? { dueDate } : {}),
      });
      await actions.review(bill.id);
      setStep('strategy');
    } catch (error) {
      onError(error);
    }
  }

  async function changeMethod(method: 'LOCAL' | 'SWIFT') {
    if (!bill || method === bill.transferMethod) return;
    try {
      await actions.patch(bill.id, { transferMethod: method });
    } catch (error) {
      onError(error);
    }
  }

  async function arm() {
    if (!bill) return;
    try {
      await actions.putStrategy(
        bill.id,
        mode === 'MAX_COST' ? { mode, maxCost } : { mode, targetPrice: target },
      );
      await actions.arm(bill.id, {
        standingInstruction: true,
        transferMethod: bill.transferMethod,
        transferReason: reason,
        reference: reference || bill.invoiceNumber,
      });
      const next = index + 1;
      if (next < ids.length) {
        setIndex(next);
        setSeen('');
        setStep('review');
        return;
      }
      onFinished(ids[0] ?? bill.id);
    } catch (error) {
      onError(error);
    }
  }

  const day = bill ? Math.floor(Date.parse(`${bill.executionDeadline}T00:00:00.000Z`) / 1000) : 0;
  const due = bill ? Math.floor(Date.parse(`${bill.dueDate}T00:00:00.000Z`) / 1000) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={step === 'review' ? 'Review bill' : 'Set target'}
      description={bill ? `${bill.vendorName} · ${index + 1} of ${ids.length}` : 'Loading the scanned bill'}
      size="lg"
      scroll
    >
      {!bill ? (
        <p className="text-fg-2">Loading the scanned bill.</p>
      ) : step === 'review' ? (
        <div className="space-y-3">
          <ExtractionReview
            fileName={bill.invoiceNumber}
            index={index}
            total={ids.length}
            fields={[
              { label: 'Vendor', value: bill.vendorName },
              { label: 'Invoice', value: bill.invoiceNumber },
              { label: 'Amount', value: `${bill.amount} ${bill.pair.base}` },
              { label: 'Due', value: formatUtcDate(bill.dueDate, 'day') },
            ]}
            reason={reason}
            onReasonChange={setReason}
            reference={reference}
            onReferenceChange={setReference}
            beneficiary={bill.beneficiary}
            extra={
              <div className="space-y-1">
                <p className="text-xs text-fg-3">Due date</p>
                <Input
                  aria-label="Due date"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
            }
            onSave={() => onOpenChange(false)}
            onContinue={() => void saveReview()}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {bill.lastPrice
              ? (
                  [
                    ['0.005', '−0.5%'],
                    ['0.01', '−1%'],
                    ['0.02', '−2%'],
                  ] as const
                ).map(([gap, label]) => (
                  <Button
                    key={gap}
                    size="sm"
                    variant="secondary"
                    onClick={() => setTarget(offsetTarget(bill.lastPrice ?? '0', gap))}
                  >
                    {label}
                  </Button>
                ))
              : null}
          </div>
          <StrategyWizardStep
            pair={bill.pair}
            amount={bill.amount}
            mode={mode}
            onModeChange={setMode}
            target={target}
            onTargetChange={setTarget}
            maxCost={maxCost}
            onMaxCostChange={setMaxCost}
            homeCurrency={bill.pair.quote}
            series={chart.data?.series ?? []}
            overlays={{
              ...(bill.lastPrice ? { entry: bill.lastPrice } : {}),
              ...(target ? { target } : {}),
              executionDeadline: day,
              dueDate: due,
              now: Math.floor(Date.now() / 1000),
              markers: [],
            }}
          />
          <TransferMethodPicker value={bill.transferMethod} onValueChange={changeMethod} options={METHODS} amount={bill.amount} />
          <p className="text-fg-2">
            Pay by {formatUtcDate(bill.executionDeadline, 'day')}. Due {formatUtcDate(bill.dueDate, 'day')}.
          </p>
          <ArmConfirm bill={{ ...bill, targetPrice: target || bill.targetPrice }} cutoffLabel={cutoffLabel} onArm={() => void arm()} />
        </div>
      )}
    </Dialog>
  );
}

function offsetTarget(last: string, gap: string): string {
  return significantPrice(D(last).mul(D('1').minus(gap)));
}
