import { D, decimalString } from '@/contracts/money';
import {
  canonicalPrice,
  distanceBps,
  estimatedCost,
  maxCostFromTarget,
  savings,
  savingsPercent,
  targetPriceFromMaxCost,
} from '@/server/domain/rateMath';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

const amount = fc.integer({ min: 1, max: 100_000 }).map((cents) => centsToMoney(cents));
const price = fc.integer({ min: 1, max: 500_000 }).map((units) => {
  const whole = Math.floor(units / 10_000);
  const frac = units % 10_000;
  return `${whole}.${String(frac).padStart(4, '0')}`;
});
const fee = fc.integer({ min: 0, max: 10_000 }).map((cents) => centsToMoney(cents));

function centsToMoney(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  return `${whole}.${String(frac).padStart(2, '0')}`;
}

describe('rate math', () => {
  it('derives the canonical price from the two amounts', () => {
    expect(canonicalPrice('11331.76', '10000')).toBe('1.133176');
    expect(() => canonicalPrice('1', '0')).toThrow(/zero/);
  });

  it('keeps cost, savings, and distance on the documented formulas', () => {
    expect(estimatedCost('1000', '1.2', '5', 2)).toBe('1205.00');
    expect(savings('1000', '1.20', '1.10', 2)).toBe('100.00');
    expect(savingsPercent('1.20', '1.10')).toBe('0.08');
    expect(distanceBps('1.10', '1.00')).toBe('909');
    expect(distanceBps('1.00', '1.10')).toBe('-1000');
    expect(distanceBps('1.10', '1.10')).toBe('0');
  });

  it('converts a max cost into a target and back within one cent', () => {
    const target = targetPriceFromMaxCost('1205.00', '1000', '5');
    expect(D(target).gt(0)).toBe(true);
    const back = maxCostFromTarget('1000', target, '5', 2);
    expect(D(back).minus('1205.00').abs().lte('0.01')).toBe(true);
  });

  it('holds the cost identity for generated amounts', () => {
    fc.assert(
      fc.property(amount, price, fee, (bill, rate, charge) => {
        const cost = estimatedCost(bill, rate, charge, 2);
        const again = maxCostFromTarget(bill, rate, charge, 2);
        return cost === again && D(savings(bill, rate, rate, 2)).isZero();
      }),
    );
  });

  it('puts a cheaper price through the target and a dearer price short of it', () => {
    fc.assert(
      fc.property(price, (now) => {
        const dearer = decimalString(D(now).mul('2'));
        return D(distanceBps(now, dearer)).lt(0) && D(distanceBps(dearer, now)).gt(0);
      }),
    );
  });
});
