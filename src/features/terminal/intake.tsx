'use client';

import type { TransferReason } from '@/contracts/airwallex';
import type { PatchBillBody } from '@/contracts/api';
import type { StrategyMode } from '@/contracts/bill';
import { DataSourceError } from '@/contracts/data-source';
import { D, significantPrice } from '@/contracts/money';
import { presentApiError } from '@/features/data/errors';
import type { IntakeMode } from '@/features/terminal/flow';
import { useBill, useBillActions, useChart } from '@/features/data/hooks';
import { useState } from 'react';
import { StrategyWizardStep } from '@/ui/patterns/strategy-wizard';
import { ExtractionReview } from '@/ui/patterns/extraction-review';
import { ArmConfirm } from '@/ui/patterns/arm-confirm';
import {
  BankDetailsForm,
  bankCountryFor,
  bankDetailsProblem,
  type BankDetailsInput,
} from '@/ui/patterns/bank-details-form';
import { ExtractionOrb } from '@/ui/patterns/extraction-orb';
import { Button } from '@/ui/primitives/button';
import { Dialog } from '@/ui/primitives/dialog';
import { Banner } from '@/ui/primitives/banner';
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
  mode,
  open,
  cutoffLabel,
  onOpenChange,
  onFinished,
  onError,
}: {
  ids: readonly string[];
  mode: IntakeMode;
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
  const [vendor, setVendor] = useState('');
  const [invoice, setInvoice] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [bank, setBank] = useState<BankDetailsInput | null>(null);
  const [modeChoice, setModeChoice] = useState<StrategyMode>('TARGET_RATE');
  const [target, setTarget] = useState('');
  const [maxCost, setMaxCost] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const [priced, setPriced] = useState('');
  const [chartNow] = useState(() => Math.floor(Date.now() / 1000));
  const id = ids[index];
  const billQuery = useBill(open ? id : undefined);
  const chart = useChart(step === 'strategy' ? id : undefined, 'TO_DUE');
  const actions = useBillActions();
  const bill = billQuery.data;
  const extraction = bill?.documents?.[0]?.extraction;
  const reading = extraction?.status === 'PENDING' || extraction?.status === 'RUNNING';
  const extractionFailed = extraction?.status === 'FAILED';

  if (bill && !reading) {
    const key = `${bill.id}:${extraction?.status ?? 'none'}:${mode}`;
    if (seen !== key) {
      const sameBill = seen.startsWith(`${bill.id}:`);
      const previousMode = seen.split(':').at(-1);
      setSeen(key);
      setProblem(undefined);
      if (!sameBill || previousMode !== mode) {
        setStep(mode === 'edit-target' || bill.state !== 'DRAFT' ? 'strategy' : 'review');
        setBank(null);
      }
      setReason(bill.transferReason);
      setReference(bill.reference ?? bill.invoiceNumber);
      setVendor(bill.vendorName);
      setInvoice(bill.invoiceNumber);
      setAmount(bill.amount);
      setCurrency(bill.pair.base);
      setDueDate(bill.dueDate);
      setModeChoice(bill.strategyMode ?? 'TARGET_RATE');
      setTarget(bill.targetPrice ?? (bill.lastPrice ? offsetTarget(bill.lastPrice, '0.01') : ''));
      setMaxCost(bill.maxCost ?? '');
    }
  }

  if (bill && !reading && bill.lastPrice && !target && priced !== `${bill.id}:${bill.lastPrice}`) {
    setPriced(`${bill.id}:${bill.lastPrice}`);
    setTarget(bill.targetPrice ?? offsetTarget(bill.lastPrice, '0.01'));
  }

  async function saveReview() {
    if (!bill) return;
    const foreign = currency.length === 3 && currency !== bill.pair.quote;
    if (!bill.beneficiary && foreign && bank) {
      const problem = bankDetailsProblem(bank);
      if (problem !== 'empty' && problem !== 'ok') {
        setProblem(problem);
        return;
      }
    }
    try {
      const patch: PatchBillBody = {};
      if (vendor.trim() && vendor !== bill.vendorName) patch.vendorName = vendor.trim();
      if (invoice.trim() && invoice !== bill.invoiceNumber) patch.invoiceNumber = invoice.trim();
      const cleanedAmount = amount.replaceAll(',', '').trim();
      if (cleanedAmount && cleanedAmount !== bill.amount) patch.amount = cleanedAmount;
      if (currency.trim().toUpperCase() !== bill.pair.base) patch.billCurrency = currency.trim().toUpperCase();
      if (dueDate && dueDate !== bill.dueDate) patch.dueDate = dueDate;
      if (reference !== (bill.reference ?? bill.invoiceNumber)) patch.reference = reference || invoice.trim();
      if (reason !== bill.transferReason) patch.transferReason = reason;
      if (Object.keys(patch).length > 0) await actions.patch(bill.id, patch);
      if (!bill.beneficiary && foreign && bank && bankDetailsProblem(bank) === 'ok') {
        await actions.resolveBeneficiary(bill.id, {
          name: bank.name,
          entityType: 'COMPANY',
          bankCountry: bank.bankCountry,
          accountCurrency: currency.trim().toUpperCase(),
          transferMethod: bill.transferMethod,
          ...(bank.iban ? { iban: bank.iban } : {}),
          ...(bank.accountNumber ? { accountNumber: bank.accountNumber } : {}),
          ...(bank.bic ? { bic: bank.bic } : {}),
          ...(bank.localBankCode ? { localBankCode: bank.localBankCode } : {}),
        });
      }
      if (bill.state === 'DRAFT') await actions.review(bill.id);
      setProblem(undefined);
      setStep('strategy');
    } catch (error) {
      setProblem(messageOf(error));
      onError(error);
    }
  }

  async function changeMethod(method: 'LOCAL' | 'SWIFT') {
    if (!bill || method === bill.transferMethod) return;
    try {
      await actions.patch(bill.id, { transferMethod: method });
    } catch (error) {
      setProblem(messageOf(error));
      onError(error);
    }
  }

  async function saveTarget() {
    if (!bill) return;
    if (modeChoice === 'MAX_COST' ? maxCost.trim().length === 0 : target.trim().length === 0) {
      setProblem('Set a target before arming');
      return;
    }
    try {
      await actions.putStrategy(
        bill.id,
        modeChoice === 'MAX_COST' ? { mode: modeChoice, maxCost } : { mode: modeChoice, targetPrice: target },
      );
      if (mode === 'edit-target') {
        onFinished(bill.id);
        return;
      }
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
      setProblem(messageOf(error));
      onError(error);
    }
  }

  const day = bill ? Math.floor(Date.parse(`${bill.executionDeadline}T00:00:00.000Z`) / 1000) : 0;
  const due = bill ? Math.floor(Date.parse(`${bill.dueDate}T00:00:00.000Z`) / 1000) : 0;
  const foreign = Boolean(bill && currency.length === 3 && currency !== bill.pair.quote);
  const title = reading ? 'Reading invoice' : step === 'review' ? 'Review bill' : mode === 'edit-target' ? 'Edit target' : 'Set target';

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={bill ? `${bill.vendorName} · ${index + 1} of ${ids.length}` : 'Loading the scanned bill'}
      size="lg"
      scroll
    >
      {!bill ? (
        <p className="text-fg-2">Loading the scanned bill.</p>
      ) : reading ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <ExtractionOrb state={extraction?.status === 'RUNNING' ? 'solving' : 'working'} size={64} />
          <p className="text-fg-2">Reading invoice</p>
        </div>
      ) : step === 'review' ? (
        <div className="space-y-3">
          {problem ? <Banner tone="error">{problem}</Banner> : null}
          {extractionFailed ? (
            <Banner tone="warn">
              {extraction?.error ?? 'The invoice could not be read. Fill in the fields below.'}
            </Banner>
          ) : null}
          <ExtractionReview
            fileName={bill.documents?.[0]?.filename ?? bill.invoiceNumber}
            index={index}
            total={ids.length}
            fields={[
              { label: 'Vendor', value: vendor, edited: vendor !== bill.vendorName, onChange: setVendor },
              { label: 'Invoice', value: invoice, edited: invoice !== bill.invoiceNumber, onChange: setInvoice },
              {
                label: 'Amount',
                value: amount,
                edited: amount !== bill.amount,
                inputMode: 'decimal',
                onChange: setAmount,
              },
              {
                label: 'Currency',
                value: currency,
                edited: currency !== bill.pair.base,
                maxLength: 3,
                onChange: (value) => setCurrency(value.toUpperCase()),
              },
              {
                label: 'Due',
                value: dueDate,
                edited: dueDate !== bill.dueDate,
                type: 'date',
                onChange: setDueDate,
              },
            ]}
            duplicate={extraction?.result?.warnings.some((warning) => warning.code === 'DUPLICATE')}
            reason={reason}
            onReasonChange={setReason}
            reference={reference}
            onReferenceChange={setReference}
            beneficiary={bill.beneficiary}
            beneficiaryForm={
              bill.beneficiary ? undefined : foreign ? (
                <BankDetailsForm
                  name={vendor || bill.vendorName}
                  country={bankCountryFor(currency)}
                  hideSubmit
                  onValuesChange={setBank}
                />
              ) : (
                <p className="text-fg-2">Choose a foreign currency before adding the bank account.</p>
              )
            }
            onSave={() => onOpenChange(false)}
            onContinue={() => void saveReview()}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {problem ? <Banner tone="error">{problem}</Banner> : null}
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
            mode={modeChoice}
            onModeChange={setModeChoice}
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
              now: chartNow,
              markers: [],
            }}
          />
          {mode === 'arm' ? (
            <TransferMethodPicker
              value={bill.transferMethod}
              onValueChange={changeMethod}
              options={METHODS}
              amount={bill.amount}
            />
          ) : null}
          <p className="text-fg-2">
            Pay by {formatUtcDate(bill.executionDeadline, 'day')}. Due {formatUtcDate(bill.dueDate, 'day')}.
          </p>
          {mode === 'edit-target' ? (
            <Button
              disabled={modeChoice === 'MAX_COST' ? maxCost.trim().length === 0 : target.trim().length === 0}
              onClick={() => void saveTarget()}
            >
              Save target
            </Button>
          ) : (
            <ArmConfirm
              bill={{ ...bill, targetPrice: target || bill.targetPrice }}
              cutoffLabel={cutoffLabel}
              onArm={() => void saveTarget()}
            />
          )}
        </div>
      )}
    </Dialog>
  );
}

function messageOf(error: unknown): string {
  if (error instanceof DataSourceError) {
    const presented = presentApiError(error.error);
    return [presented.title, presented.body].filter(Boolean).join(' · ');
  }
  return error instanceof Error ? error.message : 'Could not do that';
}

function offsetTarget(last: string, gap: string): string {
  return significantPrice(D(last).mul(D('1').minus(gap)));
}
