import { D } from '@/contracts/money';
import type { TransferMethod } from '@/contracts/airwallex';
import { formatMoney } from '@/ui/format';

export interface MethodLimit {
  amount: string;
  currency: string;
}

export interface TransferMethodOption {
  method: TransferMethod;
  flightTime?: { min?: string; max?: string };
  transferLimit?: { min?: MethodLimit; max?: MethodLimit };
}

const FALLBACK_LEAD: Record<TransferMethod, number> = { LOCAL: 1, SWIFT: 3 };

export function durationDays(value?: string): number | undefined {
  const match = value?.match(/^P(\d+)D$/);
  if (!match?.[1]) return undefined;
  return Number(match[1]);
}

export function flightLabel(option: TransferMethodOption): string {
  const min = durationDays(option.flightTime?.min);
  const max = durationDays(option.flightTime?.max);
  if (min !== undefined && max !== undefined && min !== max) {
    return `${min}–${max} business days`;
  }
  const days = max ?? min ?? FALLBACK_LEAD[option.method];
  return days === 1 ? '1 business day' : `${days} business days`;
}

export function limitLabel(option: TransferMethodOption): string | undefined {
  const max = option.transferLimit?.max;
  if (!max) return undefined;
  return `max ${formatMoney(max.currency, max.amount)}`;
}

export function overLimitReason(
  option: TransferMethodOption,
  amount?: string,
  other?: TransferMethod,
): string | undefined {
  const max = option.transferLimit?.max;
  if (!amount || !max) return undefined;
  if (!D(amount).greaterThan(D(max.amount))) return undefined;
  if (other) return `Above ${option.method} limit, so use ${other}`;
  return `Above the ${option.method} limit of ${formatMoney(max.currency, max.amount)}`;
}
