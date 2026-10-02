import { BILL_STATES, type BillState } from '@/contracts/bill';
import { CORRIDORS } from '@/mocks/generators/corridors';
import { addBusinessDays, addDays } from '@/mocks/generators/dates';
import type { Template, Variant } from '@/mocks/generators/invoices';

export const PROFILE_NAMES = [
  'mixed',
  'lifecycle',
  'deadline',
  'corridors',
  'extraction',
  'upload',
  'stress',
  'e2e',
] as const;

export type ProfileName = (typeof PROFILE_NAMES)[number];

export interface BillSlot {
  state: BillState;
  currency: string;
  dueDate: string;
  targetDistanceBps?: number;
  strategyMode?: 'TARGET_RATE' | 'MAX_COST';
  transferMethod?: 'LOCAL' | 'SWIFT';
  template?: Template;
  variant?: Variant;
}

const WATCHING_DISTANCES = [10, 20, 30, 80, 300];
const PRIMARY = ['EUR', 'GBP', 'JPY', 'SGD', 'AUD', 'INR'] as const;

function cycleCurrency(index: number, currencies: readonly string[]): string {
  return currencies[index % currencies.length] ?? 'EUR';
}

/** Profile definitions: target states, due dates and target distances. */
export function profileSlots(profile: ProfileName, asOf: string): BillSlot[] {
  const all = CORRIDORS.map((corridor) => corridor.currency);
  if (profile === 'mixed') {
    const states: BillState[] = [
      'DRAFT',
      'DRAFT',
      'READY',
      'READY',
      'WATCHING',
      'WATCHING',
      'WATCHING',
      'WATCHING',
      'WATCHING',
      'PAUSED',
      'EXECUTING',
      'PAID',
    ];
    return states.map((state, index) => ({
      state,
      currency: cycleCurrency(index, PRIMARY),
      dueDate: addDays(asOf, 10 + index),
      targetDistanceBps:
        state === 'WATCHING' ? WATCHING_DISTANCES[index - 4] : undefined,
      strategyMode: index === 6 ? 'MAX_COST' : 'TARGET_RATE',
    }));
  }
  if (profile === 'lifecycle') {
    return BILL_STATES.map((state, index) => ({
      state,
      currency: cycleCurrency(index, all),
      dueDate: addDays(asOf, 14),
      targetDistanceBps: 80,
      strategyMode: 'TARGET_RATE',
    }));
  }
  if (profile === 'deadline') {
    const tomorrow = addDays(asOf, 1);
    const plus2 = addBusinessDays(asOf, 2);
    return [
      {
        state: 'WATCHING' as const,
        currency: 'EUR',
        dueDate: addBusinessDays(asOf, 1),
        transferMethod: 'LOCAL' as const,
      },
      {
        state: 'WATCHING' as const,
        currency: 'GBP',
        dueDate: addBusinessDays(tomorrow, 1),
        transferMethod: 'LOCAL' as const,
      },
      {
        state: 'WATCHING' as const,
        currency: 'JPY',
        dueDate: addBusinessDays(plus2, 3),
        transferMethod: 'SWIFT' as const,
      },
      {
        state: 'WATCHING' as const,
        currency: 'INR',
        dueDate: addDays(asOf, 4),
        transferMethod: 'LOCAL' as const,
      },
      {
        state: 'WATCHING' as const,
        currency: 'AUD',
        dueDate: addBusinessDays(asOf, 6),
        transferMethod: 'LOCAL' as const,
      },
      {
        state: 'WATCHING' as const,
        currency: 'SGD',
        dueDate: addBusinessDays(asOf, 8),
        transferMethod: 'SWIFT' as const,
      },
    ].map((slot) => ({
      ...slot,
      targetDistanceBps: 100,
      strategyMode: 'TARGET_RATE' as const,
    }));
  }
  if (profile === 'corridors') {
    return all.map((currency) => ({
      state: 'WATCHING' as const,
      currency,
      dueDate: addDays(asOf, 21),
      targetDistanceBps: 80,
      strategyMode: 'TARGET_RATE' as const,
    }));
  }
  if (profile === 'stress') {
    return Array.from({ length: 200 }, (_, index) => ({
      state: 'WATCHING' as const,
      currency: cycleCurrency(index, all),
      dueDate: addDays(asOf, 5 + (index % 20)),
      targetDistanceBps: WATCHING_DISTANCES[index % WATCHING_DISTANCES.length],
      strategyMode: 'TARGET_RATE' as const,
    }));
  }
  if (profile === 'e2e') {
    const states: BillState[] = [
      'DRAFT',
      'READY',
      'WATCHING',
      'PAUSED',
      'EXECUTING',
      'PAID',
    ];
    return states.map((state, index) => ({
      state,
      currency: cycleCurrency(index, PRIMARY),
      dueDate: addDays(asOf, 12),
      targetDistanceBps: 80,
      strategyMode: 'TARGET_RATE' as const,
    }));
  }
  return [];
}
