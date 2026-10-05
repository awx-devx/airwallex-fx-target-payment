import type { Clock } from '@/server/adapters/clock';

export interface DemoClockState {
  speed: number;
  realOrigin: number;
  warpedOrigin: number;
}

let snapshot: DemoClockState | null = null;

export function noteDemoClock(state: DemoClockState | null): void {
  snapshot = state;
}

/**
 * DEMO-ONLY: while a demo clock is stored, time follows that speed and origin.
 * PROD: the worker uses the system clock and this wrapper is not installed.
 */
export function demoAwareClock(inner: Clock, readRealMs: () => number): Clock {
  return {
    now() {
      if (!snapshot) return inner.now();
      const elapsed = readRealMs() - snapshot.realOrigin;
      return new Date(snapshot.warpedOrigin + elapsed * snapshot.speed);
    },
  };
}
