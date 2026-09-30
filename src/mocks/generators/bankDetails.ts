import type { Rng } from '@/mocks/generators/rng';

/**
 * DEMO-ONLY: fictional account numbers in a valid format. Bank ids are
 * placeholders until B2.2 records the sandbox allowlist (V12).
 * PROD: the vendor's own bank details, created through Airwallex.
 */

export interface BankDetails {
  country: string;
  currency: string;
  accountName: string;
  iban?: string;
  bic?: string;
  sortCode?: string;
  accountNumber?: string;
  ifsc?: string;
  bsb?: string;
  routingNumber?: string;
  bankCode?: string;
  branchCode?: string;
}

export function mod97(input: string): number {
  let acc = BigInt(0);
  for (const char of input) {
    const expanded =
      char >= 'A' && char <= 'Z' ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of expanded) {
      acc = (acc * BigInt(10) + BigInt(digit)) % BigInt(97);
    }
  }
  return Number(acc);
}

export function isValidIban(iban: string): boolean {
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  return mod97(rearranged) === 1;
}

export function buildIban(country: string, bban: string): string {
  const check = 98 - mod97(`${bban}${country}00`);
  return `${country}${String(check).padStart(2, '0')}${bban}`;
}

export function luhnCheckDigit(payload: string): string {
  let sum = 0;
  const chars = payload.split('').reverse();
  chars.forEach((char, index) => {
    let digit = Number(char);
    if (index % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  });
  return String((10 - (sum % 10)) % 10);
}

export function isValidLuhn(value: string): boolean {
  let sum = 0;
  const chars = value.split('').reverse();
  chars.forEach((char, index) => {
    let digit = Number(char);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  });
  return sum % 10 === 0;
}

export function abaCheckDigit(first8: string): string {
  const weights = [3, 7, 1, 3, 7, 1, 3, 7];
  let sum = 0;
  for (let i = 0; i < 8; i += 1) sum += (weights[i] ?? 0) * Number(first8[i]);
  return String((10 - (sum % 10)) % 10);
}

export function isValidAba(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) return false;
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += (weights[i] ?? 0) * Number(routing[i]);
  return sum % 10 === 0;
}

export function isValidIfsc(ifsc: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);
}

function digits(rng: Rng, length: number): string {
  let value = '';
  for (let i = 0; i < length; i += 1) value += String(rng.int(0, 9));
  return value;
}

function accountWithLuhn(rng: Rng, length: number): string {
  const payload = digits(rng, length - 1);
  return `${payload}${luhnCheckDigit(payload)}`;
}

export function generateBank(
  rng: Rng,
  input: {
    country: string;
    currency: string;
    accountName: string;
    kind: 'iban' | 'gb' | 'ifsc' | 'bsb' | 'aba' | 'jp' | 'routing';
    ibanCountry?: string;
    bankCode?: string;
    bic?: string;
    bbanLength?: number;
  },
): BankDetails {
  const base = {
    country: input.country,
    currency: input.currency,
    accountName: input.accountName,
  };
  if (input.kind === 'iban') {
    const country = input.ibanCountry ?? input.country;
    const bankCode = input.bankCode ?? digits(rng, 8);
    const bbanLength = input.bbanLength ?? bankCode.length + 10;
    const bban = `${bankCode}${digits(rng, bbanLength - bankCode.length)}`;
    return { ...base, iban: buildIban(country, bban), bic: input.bic };
  }
  if (input.kind === 'gb') {
    return {
      ...base,
      sortCode: input.bankCode ?? '200000',
      accountNumber: accountWithLuhn(rng, 8),
    };
  }
  if (input.kind === 'ifsc') {
    const suffix = digits(rng, 6);
    return {
      ...base,
      ifsc: `${input.bankCode ?? 'HDFC'}0${suffix}`,
      accountNumber: accountWithLuhn(rng, 12),
    };
  }
  if (input.kind === 'bsb') {
    return {
      ...base,
      bsb: input.bankCode ?? '062000',
      accountNumber: accountWithLuhn(rng, 9),
    };
  }
  if (input.kind === 'aba') {
    const first8 = digits(rng, 8);
    return {
      ...base,
      routingNumber: `${first8}${abaCheckDigit(first8)}`,
      accountNumber: accountWithLuhn(rng, 10),
    };
  }
  if (input.kind === 'jp') {
    return {
      ...base,
      bankCode: input.bankCode ?? '0005',
      branchCode: digits(rng, 3),
      accountNumber: accountWithLuhn(rng, 7),
    };
  }
  return {
    ...base,
    bankCode: input.bankCode ?? digits(rng, 4),
    accountNumber: accountWithLuhn(rng, 10),
  };
}
