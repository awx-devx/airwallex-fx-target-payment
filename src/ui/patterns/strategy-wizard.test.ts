import { targetFromMaxCost } from '@/ui/patterns/strategy-wizard';
import { describe, expect, it } from 'vitest';

describe('targetFromMaxCost', () => {
  it('divides a max cost by the bill amount', () => {
    expect(targetFromMaxCost('2816', '2500')).toBe('1.1264');
  });

  it('keeps the current line when the cost is not a positive decimal', () => {
    expect(targetFromMaxCost('', '2500')).toBeUndefined();
    expect(targetFromMaxCost('0', '2500')).toBeUndefined();
  });
});
