'use client';

import { useState } from 'react';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';

export interface BankDetailsInput {
  name: string;
  bankCountry: string;
  iban?: string;
  accountNumber?: string;
  bic?: string;
  localBankCode?: string;
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

export function bankCountryFor(currency: string): string {
  return BANK_COUNTRY[currency] ?? '';
}

/** `empty` means the account fields were left blank. Anything else is a message. */
export function bankDetailsProblem(input: BankDetailsInput): 'empty' | 'ok' | string {
  const iban = input.iban?.replaceAll(/\s+/g, '') ?? '';
  const account = input.accountNumber?.replaceAll(/\s+/g, '') ?? '';
  if (iban.length === 0 && account.length === 0) return 'empty';
  if (input.bankCountry.trim().length !== 2) return 'Bank country is a two-letter code.';
  if (iban.length < 4 && account.length < 4) return 'Enter an IBAN or an account number.';
  return 'ok';
}

export function BankDetailsForm({
  name,
  country,
  onSave,
  onValuesChange,
  hideSubmit = false,
  disabled = false,
  saving = false,
}: {
  name: string;
  country: string;
  onSave?: (input: BankDetailsInput) => void;
  onValuesChange?: (input: BankDetailsInput) => void;
  hideSubmit?: boolean;
  disabled?: boolean;
  saving?: boolean;
}) {
  const [accountName, setAccountName] = useState(name);
  const [bankCountry, setBankCountry] = useState(country);
  const [iban, setIban] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bic, setBic] = useState('');
  const [localBankCode, setLocalBankCode] = useState('');
  const [error, setError] = useState<string | undefined>();

  function values(next: Partial<BankDetailsInput> = {}): BankDetailsInput {
    const resolved = {
      name: next.name ?? accountName,
      bankCountry: next.bankCountry ?? bankCountry,
      iban: next.iban ?? iban,
      accountNumber: next.accountNumber ?? accountNumber,
      bic: next.bic ?? bic,
      localBankCode: next.localBankCode ?? localBankCode,
    };
    const trimmedIban = resolved.iban.replaceAll(/\s+/g, '');
    const trimmedAccount = resolved.accountNumber.replaceAll(/\s+/g, '');
    return {
      name: resolved.name.trim() || name,
      bankCountry: resolved.bankCountry.trim().toUpperCase(),
      ...(trimmedIban ? { iban: trimmedIban } : {}),
      ...(trimmedAccount ? { accountNumber: trimmedAccount } : {}),
      ...(resolved.bic.trim() ? { bic: resolved.bic.trim() } : {}),
      ...(resolved.localBankCode.trim() ? { localBankCode: resolved.localBankCode.trim() } : {}),
    };
  }

  function edit(next: Partial<BankDetailsInput>) {
    if (next.name !== undefined) setAccountName(next.name);
    if (next.bankCountry !== undefined) setBankCountry(next.bankCountry);
    if (next.iban !== undefined) setIban(next.iban);
    if (next.accountNumber !== undefined) setAccountNumber(next.accountNumber);
    if (next.bic !== undefined) setBic(next.bic);
    if (next.localBankCode !== undefined) setLocalBankCode(next.localBankCode);
    onValuesChange?.(values(next));
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const input = values();
        const problem = bankDetailsProblem(input);
        if (problem !== 'ok') {
          setError(problem === 'empty' ? 'Enter an IBAN or an account number.' : problem);
          return;
        }
        setError(undefined);
        onSave?.(input);
      }}
    >
      <p className="text-fg-2">Save the vendor bank account before this bill can be armed.</p>
      <Input
        aria-label="Account name"
        value={accountName}
        disabled={disabled}
        onChange={(event) => edit({ name: event.target.value })}
      />
      <Input
        aria-label="Bank country"
        value={bankCountry}
        maxLength={2}
        disabled={disabled}
        onChange={(event) => edit({ bankCountry: event.target.value.toUpperCase() })}
        placeholder="Country"
      />
      <Input
        aria-label="IBAN"
        value={iban}
        disabled={disabled}
        onChange={(event) => edit({ iban: event.target.value })}
        placeholder="IBAN"
      />
      <Input
        aria-label="Account number"
        value={accountNumber}
        disabled={disabled}
        onChange={(event) => edit({ accountNumber: event.target.value })}
        placeholder="Account number"
      />
      <Input
        aria-label="BIC"
        value={bic}
        disabled={disabled}
        onChange={(event) => edit({ bic: event.target.value })}
        placeholder="BIC"
      />
      <Input
        aria-label="Local bank code"
        value={localBankCode}
        disabled={disabled}
        onChange={(event) => edit({ localBankCode: event.target.value })}
        placeholder="Sort code, IFSC, or bank code"
      />
      {error ? <p className="text-xs text-down">{error}</p> : null}
      {hideSubmit ? null : (
        <Button size="sm" type="submit" disabled={disabled} loading={saving}>
          Save bank details
        </Button>
      )}
    </form>
  );
}
