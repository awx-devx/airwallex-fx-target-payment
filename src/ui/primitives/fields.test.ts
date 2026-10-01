import { describe, expect, it } from 'vitest';
import { commitAmount } from '@/ui/primitives/amount';
import { stepPrice } from '@/ui/primitives/rate';
import {
  flightLabel,
  limitLabel,
  overLimitReason,
} from '@/ui/primitives/transfer-method';

const EUR_USD = { base: 'EUR', quote: 'USD' };
const JPY_USD = { base: 'JPY', quote: 'USD' };

describe('commitAmount', () => {
  it('strips grouping and rounds to payout precision', () => {
    expect(commitAmount('1,234.5', 'EUR')).toBe('1234.50');
    expect(commitAmount('100.5', 'KES')).toBe('101');
    expect(commitAmount('1.2345', 'BHD')).toBe('1.235');
  });

  it('treats blank as empty and anything else as invalid', () => {
    expect(commitAmount('  ', 'USD')).toBe('');
    expect(commitAmount('12.3.4', 'USD')).toBeNull();
    expect(commitAmount('1e2', 'USD')).toBeNull();
  });
});

describe('stepPrice', () => {
  it('steps the displayed quote by one pip', () => {
    expect(stepPrice('1.08412', EUR_USD, false, 1)).toBe('1.08422');
    expect(stepPrice('1.08412', EUR_USD, false, -10)).toBe('1.08312');
  });

  it('steps an inverted JPY display by 0.01, then stores canonical p', () => {
    const next = stepPrice('0.0067', JPY_USD, true, 1);
    expect(next).toBe('0.00669955113');
  });
});

describe('transfer method labels', () => {
  it('reads flight time and falls back when the schema is missing', () => {
    expect(
      flightLabel({ method: 'LOCAL', flightTime: { min: 'P0D', max: 'P3D' } }),
    ).toBe('0–3 business days');
    expect(flightLabel({ method: 'LOCAL' })).toBe('1 business day');
    expect(flightLabel({ method: 'SWIFT' })).toBe('3 business days');
  });

  it('disables a method that the amount exceeds', () => {
    const local = {
      method: 'LOCAL' as const,
      transferLimit: { max: { amount: '10000', currency: 'USD' } },
    };
    expect(limitLabel(local)).toBe('max 10,000.00 USD');
    expect(overLimitReason(local, '2500', 'SWIFT')).toBeUndefined();
    expect(overLimitReason(local, '25000', 'SWIFT')).toBe(
      'Above LOCAL limit, so use SWIFT',
    );
    expect(overLimitReason(local, '25000')).toBe(
      'Above the LOCAL limit of 10,000.00 USD',
    );
  });
});
