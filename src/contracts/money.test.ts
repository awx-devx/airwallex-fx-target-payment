import { describe, expect, it } from 'vitest';
import { D, decimalString } from '@/contracts/money';

describe('decimalString', () => {
  it('keeps a sub-pip price change in plain notation', () => {
    const delta = D('1.084120879').minus(D('1.084120000'));
    const text = decimalString(delta);
    expect(text).toBe('0.000000879');
    expect(D(text).eq(delta)).toBe(true);
  });
});
