import { describe, expect, it } from 'vitest';
import { createClock, isWarpClock } from '@/server/adapters/clock';

describe('Clock', () => {
  it('reads the injected system time', () => {
    let ms = 1_000;
    const clock = createClock('system', () => ms);
    expect(clock.now().getTime()).toBe(1_000);
    ms = 5_000;
    expect(clock.now().getTime()).toBe(5_000);
    expect(isWarpClock(clock)).toBe(false);
  });

  it('warps elapsed time and can jump', () => {
    let ms = 0;
    const clock = createClock('warp', () => ms);
    expect(isWarpClock(clock)).toBe(true);
    if (!isWarpClock(clock)) return;
    expect(clock.now().getTime()).toBe(0);
    clock.setSpeed(10);
    ms += 1_000;
    expect(clock.now().getTime()).toBe(10_000);
    clock.jumpTo(new Date(50_000));
    expect(clock.now().getTime()).toBe(50_000);
    expect(clock.speed).toBe(10);
  });
});
