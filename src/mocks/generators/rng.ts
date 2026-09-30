import Decimal from 'decimal.js';
import { formatDecimal } from '@/contracts/money';

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Uniform amount in major units, exact at `precision`. */
  money(minMajor: string, maxMajor: string, precision: number): string;
}

/** Mulberry32. The same seed yields the same sequence. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      if (items.length === 0) throw new Error('Cannot pick from an empty list');
      return items[this.int(0, items.length - 1)] as (typeof items)[number];
    },
    money(minMajor, maxMajor, precision) {
      const scale = new Decimal(10).pow(precision);
      const min = new Decimal(minMajor)
        .mul(scale)
        .toDecimalPlaces(0)
        .toNumber();
      const max = new Decimal(maxMajor)
        .mul(scale)
        .toDecimalPlaces(0)
        .toNumber();
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
        throw new Error('Amount range does not fit in a safe integer');
      }
      const units = this.int(min, max);
      return formatDecimal(new Decimal(units).div(scale), precision);
    },
  };
}
