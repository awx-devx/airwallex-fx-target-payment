/**
 * DEMO-ONLY: warp speed and jumpTo for rehearsals. The reader is injected so
 * tests do not touch the wall clock.
 * PROD: system clock; demo endpoints removed.
 */
export interface Clock {
  now(): Date;
}

export class ManualClock implements Clock {
  constructor(private currentMs: number) {}

  now(): Date {
    return new Date(this.currentMs);
  }

  advance(ms: number): void {
    this.currentMs += ms;
  }

  set(ms: number): void {
    this.currentMs = ms;
  }
}

export class WarpClock implements Clock {
  private realOrigin: number;
  private warpedOrigin: number;
  private speed = 1;

  constructor(
    private readonly readRealMs: () => number,
    start: Date,
  ) {
    this.realOrigin = readRealMs();
    this.warpedOrigin = start.getTime();
  }

  now(): Date {
    const elapsed = this.readRealMs() - this.realOrigin;
    return new Date(this.warpedOrigin + elapsed * this.speed);
  }

  setSpeed(speed: number): void {
    if (!(speed > 0)) throw new Error('Warp speed must be positive');
    const warped = this.now().getTime();
    this.realOrigin = this.readRealMs();
    this.warpedOrigin = warped;
    this.speed = speed;
  }

  jumpTo(date: Date): void {
    this.realOrigin = this.readRealMs();
    this.warpedOrigin = date.getTime();
  }

  get warpSpeed(): number {
    return this.speed;
  }
}
