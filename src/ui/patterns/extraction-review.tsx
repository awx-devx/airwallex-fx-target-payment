'use client';

import type { BeneficiarySummary, FieldError, TransferReason } from '@/contracts/airwallex';
import type { ReactNode } from 'react';
import { Banner } from '@/ui/primitives/banner';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Select } from '@/ui/primitives/select';
import { Stepper } from '@/ui/primitives/stepper';
import { BeneficiaryCard } from '@/ui/trading/beneficiary-card';
import { ExtractionField } from '@/ui/trading/extraction-field';

const REASONS: { value: TransferReason; label: string }[] = [
  { value: 'goods_purchased', label: 'Goods purchased' },
  { value: 'professional_business_services', label: 'Professional services' },
  { value: 'freight', label: 'Freight' },
  { value: 'technical_services', label: 'Technical services' },
  { value: 'bill_payment', label: 'Bill payment' },
];

export interface ExtractedField {
  label: string;
  value?: string;
  confidence?: 'high' | 'medium' | 'low';
  edited?: boolean;
  missing?: boolean;
}

export function ExtractionReview({
  fileName,
  index,
  total,
  fields,
  reason,
  onReasonChange,
  reference,
  onReferenceChange,
  beneficiary,
  duplicate = false,
  fieldErrors = [],
  beneficiaryForm,
  extra,
  onSave,
  onContinue,
}: {
  fileName: string;
  index: number;
  total: number;
  fields: readonly ExtractedField[];
  reason?: TransferReason;
  onReasonChange?: (reason: TransferReason) => void;
  reference: string;
  onReferenceChange?: (reference: string) => void;
  beneficiary?: BeneficiarySummary;
  duplicate?: boolean;
  fieldErrors?: readonly FieldError[];
  beneficiaryForm?: ReactNode;
  extra?: ReactNode;
  onSave?: () => void;
  onContinue?: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex min-h-64 items-center justify-center rounded-md border border-line-1 bg-bg-1 p-6 text-fg-3">
        {fileName}
      </div>
      <div className="space-y-3">
        <Stepper
          steps={Array.from({ length: total }, (_, step) => ({
            label: `Bill ${step + 1}`,
            state: step < index ? 'complete' : step === index ? 'current' : 'upcoming',
          }))}
        />
        <div className="space-y-1">
          {fields.map((field) => (
            <ExtractionField key={field.label} {...field} />
          ))}
        </div>
        <Select
          label="Transfer reason"
          value={reason}
          onValueChange={(value) => onReasonChange?.(value as TransferReason)}
          options={REASONS}
        />
        <Input
          aria-label="Payment reference"
          value={reference}
          onChange={(event) => onReferenceChange?.(event.target.value)}
          placeholder="Payment reference"
        />
        {duplicate ? <Banner tone="warn">This invoice number is already in the book.</Banner> : null}
        {fieldErrors.map((error) => (
          <p key={error.path} className="text-xs text-down">
            {error.path}: {error.message}
          </p>
        ))}
        {extra}
        {beneficiary ? <BeneficiaryCard beneficiary={beneficiary} /> : beneficiaryForm}
        {!beneficiary && !beneficiaryForm ? (
          <BeneficiaryCard missing={['IBAN', 'Bank name']} />
        ) : null}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onSave}>
            Save as draft
          </Button>
          <Button onClick={onContinue}>Continue to strategy</Button>
        </div>
      </div>
    </div>
  );
}
