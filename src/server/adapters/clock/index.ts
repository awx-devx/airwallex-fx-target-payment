import { WarpClock } from '@/mocks/market/clock';

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  constructor(private readonly readRealMs: () => number = Date.now) {}

  now(): Date {
    return new Date(this.readRealMs());
  }
}

export class AppWarpClock implements Clock {
  private readonly inner: WarpClock;

  constructor(readRealMs: () => number, start: Date) {
    this.inner = new WarpClock(readRealMs, start);
  }

  now(): Date {
    return this.inner.now();
  }

  setSpeed(speed: number): void {
    this.inner.setSpeed(speed);
  }

  jumpTo(date: Date): void {
    this.inner.jumpTo(date);
  }

  get speed(): number {
    return this.inner.warpSpeed;
  }
}

export function createClock(
  kind: 'system' | 'warp',
  readRealMs: () => number = Date.now,
): SystemClock | AppWarpClock {
  if (kind === 'system') return new SystemClock(readRealMs);
  // DEMO-ONLY: CLOCK=warp speeds and jumps time for rehearsals.
  // PROD: CLOCK=system. Demo endpoints that change the clock are not deployed.
  return new AppWarpClock(readRealMs, new Date(readRealMs()));
}

export function isWarpClock(clock: Clock): clock is AppWarpClock {
  return clock instanceof AppWarpClock;
}
