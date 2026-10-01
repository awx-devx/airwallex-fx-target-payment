import { describe, expect, it } from 'vitest';
import { interpolateDecimal } from '@/ui/motion/interpolate';

describe('interpolateDecimal', () => {
  it('blends on the wider scale and clamps progress', () => {
    expect(interpolateDecimal('100.00', '200.00', '0')).toBe('100.00');
    expect(interpolateDecimal('100.00', '200.00', '0.5')).toBe('150.00');
    expect(interpolateDecimal('100.00', '200.00', '1')).toBe('200.00');
    expect(interpolateDecimal('100.00', '200.00', '-1')).toBe('100.00');
    expect(interpolateDecimal('100.00', '200.00', '2')).toBe('200.00');
    expect(interpolateDecimal('1', '1.08412', '0')).toBe('1.00000');
  });

  it('rejects a non-decimal endpoint', () => {
    expect(() => interpolateDecimal('nope', '1', '0')).toThrow(/decimal/);
  });
});
