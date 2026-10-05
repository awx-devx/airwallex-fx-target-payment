import { dur2, durTick } from '@/ui/tokens/motion';

/** Chart pulse, then the toast. Reduced motion shows the toast immediately. */
export function targetHitTiming(reduced: boolean): { pulseMs: number; toastDelayMs: number } {
  if (reduced) return { pulseMs: 0, toastDelayMs: 0 };
  return {
    pulseMs: Math.round(durTick * 1000),
    toastDelayMs: Math.round(dur2 * 1000),
  };
}
