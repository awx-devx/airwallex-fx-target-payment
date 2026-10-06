'use client';

import type { BankOption, BeneficiaryFormSchema, FieldError, FormSchemaField, TransferMethod } from '@/contracts/airwallex';
import { useState } from 'react';
import { Button } from '@/ui/primitives/button';
import { Radio } from '@/ui/primitives/choice';
import { Input } from '@/ui/primitives/input';
import { Select } from '@/ui/primitives/select';
import { Spinner } from '@/ui/primitives/spinner';
import { TransferMethodPicker } from '@/ui/primitives/transfer-method-picker';
import type { TransferMethodOption } from '@/ui/primitives/transfer-method';

export function SchemaForm({
  schema,
  values,
  onValuesChange,
  errors = [],
  loading = false,
  refreshing = false,
  submitting = false,
  banks = [],
  searching = false,
  onSearch,
  onRefresh,
  onSubmit,
}: {
  schema?: BeneficiaryFormSchema;
  values: Record<string, string>;
  onValuesChange: (values: Record<string, string>) => void;
  errors?: readonly FieldError[];
  loading?: boolean;
  refreshing?: boolean;
  submitting?: boolean;
  banks?: readonly BankOption[];
  searching?: boolean;
  onSearch?: (path: string, keyword: string) => void;
  onRefresh?: (path: string, values: Record<string, string>) => void;
  onSubmit?: (values: Record<string, string>) => void;
}) {
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  if (loading || !schema) {
    return (
      <div className="flex items-center gap-2 text-fg-2">
        <Spinner size="sm" /> Loading beneficiary form
      </div>
    );
  }
  function errorFor(path: string): string | undefined {
    return errors.find((error) => error.path === path)?.message ?? localErrors[path];
  }
  function change(field: FormSchemaField, value: string) {
    const next = { ...values, [field.path]: value };
    onValuesChange(next);
    if (field.pattern && value && !matches(field.pattern, value)) {
      setLocalErrors((current) => ({ ...current, [field.path]: 'Does not match the required format' }));
    } else {
      setLocalErrors((current) => {
        const copy = { ...current };
        delete copy[field.path];
        return copy;
      });
    }
    if (field.refresh) onRefresh?.(field.path, next);
    if (field.type === 'DYNAMIC_SELECT') onSearch?.(field.path, value);
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(values);
      }}
    >
      <p className="text-xs text-fg-3">
        {schema.condition.bankCountry} · {schema.condition.accountCurrency} · {schema.condition.transferMethod}
        {refreshing ? ' · updating' : ''}
      </p>
      {schema.fields.map((field) => (
        <Field
          key={field.path}
          field={field}
          value={values[field.path] ?? field.default ?? ''}
          error={errorFor(field.path)}
          banks={banks}
          searching={searching}
          onChange={(value) => change(field, value)}
        />
      ))}
      <Button type="submit" loading={submitting}>Validate and verify</Button>
    </form>
  );
}

function Field({
  field,
  value,
  error,
  banks,
  searching,
  onChange,
}: {
  field: FormSchemaField;
  value: string;
  error?: string;
  banks: readonly BankOption[];
  searching: boolean;
  onChange: (value: string) => void;
}) {
  const label = field.required ? `${field.label} *` : field.label;
  if (!field.enabled) return <p className="text-xs text-fg-3">{label} is unavailable</p>;
  if (field.type === 'SELECT') {
    return (
      <div>
        <Select
          label={label}
          value={value}
          onValueChange={onChange}
          options={(field.options ?? []).map((option) => ({ value: option.value, label: option.label }))}
        />
        {error ? <p className="mt-1 text-xs text-down">{error}</p> : null}
        {field.tip ? <p className="mt-1 text-xs text-fg-3">{field.tip}</p> : null}
      </div>
    );
  }
  if (field.type === 'RADIO') {
    return (
      <div>
        <Radio
          label={label}
          value={value}
          onValueChange={onChange}
          options={(field.options ?? []).map((option) => ({ value: option.value, label: option.label }))}
        />
        {error ? <p className="mt-1 text-xs text-down">{error}</p> : null}
      </div>
    );
  }
  if (field.type === 'TRANSFER_METHOD') {
    const options: TransferMethodOption[] = (field.options ?? [])
      .filter((option) => option.value === 'LOCAL' || option.value === 'SWIFT')
      .map((option) => ({
        method: option.value as TransferMethod,
        flightTime: option.flightTime,
        transferLimit: option.transferLimit,
      }));
    return (
      <TransferMethodPicker
        label={label}
        value={value === 'LOCAL' || value === 'SWIFT' ? value : undefined}
        onValueChange={onChange}
        options={options}
      />
    );
  }
  if (field.type === 'DYNAMIC_SELECT') {
    return (
      <div className="space-y-1">
        <Input
          aria-label={label}
          value={value}
          placeholder={field.placeholder ?? 'Search banks'}
          error={error}
          loading={searching}
          onChange={(event) => onChange(event.target.value)}
        />
        {banks.length > 0 ? (
          <ul className="rounded-sm border border-line-2">
            {banks.map((bank) => (
              <li key={bank.routingValue}>
                <button
                  type="button"
                  className="w-full px-2 py-1 text-left text-[13px] hover:bg-bg-3"
                  onClick={() => onChange(bank.label)}
                >
                  {bank.label}
                  <span className="num text-fg-3"> · {bank.routingValue}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }
  return (
    <div>
      <Input
        aria-label={label}
        value={value}
        placeholder={field.placeholder ?? field.example}
        error={error}
        onChange={(event) => onChange(event.target.value)}
      />
      {field.description ? <p className="mt-1 text-xs text-fg-3">{field.description}</p> : null}
    </div>
  );
}

function matches(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return true;
  }
}
