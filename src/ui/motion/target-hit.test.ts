import { targetHitTiming } from '@/ui/motion/target-hit';
import { describe, expect, it } from 'vitest';

describe('targetHitTiming', () => {
  it('pulses the chart before the toast', () => {
    const timing = targetHitTiming(false);
    expect(timing.pulseMs).toBe(600);
    expect(timing.toastDelayMs).toBe(200);
    expect(timing.toastDelayMs).toBeLessThan(timing.pulseMs);
  });

  it('skips the sequence under reduced motion', () => {
    expect(targetHitTiming(true)).toEqual({ pulseMs: 0, toastDelayMs: 0 });
  });
});
