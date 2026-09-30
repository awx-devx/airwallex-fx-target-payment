import { describe, expect, it } from 'vitest';
import { D, significantPrice } from '@/contracts/money';
import { ManualClock, WarpClock } from '@/mocks/market/clock';
import { DEMO_ANCHORS, SimulatedMarket } from '@/mocks/market/gbm';

describe('SimulatedMarket', () => {
  it('repeats prices for the same seed and step count', () => {
    const left = new SimulatedMarket(7, DEMO_ANCHORS);
    const right = new SimulatedMarket(7, DEMO_ANCHORS);
    for (let step = 0; step < 40; step += 1) {
      left.step(step);
      right.step(step);
    }
    expect(left.price('EUR', 'USD')).toBe(right.price('EUR', 'USD'));
    expect(left.history('GBP', 'USD')).toEqual(right.history('GBP', 'USD'));
  });

  it('applies nudge, ramp and spike deterministically', () => {
    const market = new SimulatedMarket(
      3,
      [{ base: 'EUR', quote: 'USD', price: '1.1000' }],
      500,
    );
    const start = market.price('EUR', 'USD');
    expect(
      D(market.nudge('EUR', 'USD', 10))
        .minus(start)
        .toFixed(),
    ).toBe('0.001');

    market.rampTo('EUR', 'USD', '1.05', 1);
    market.step(1);
    market.step(2);
    expect(market.price('EUR', 'USD')).toBe(significantPrice(D('1.05')));

    const held = market.price('EUR', 'USD');
    market.spike('EUR', 'USD', 20, 1);
    market.step(3);
    const midSpike = market.price('EUR', 'USD');
    market.step(4);
    expect(midSpike).not.toBe(held);
    expect(market.price('EUR', 'USD')).toBe(held);

    const again = new SimulatedMarket(
      3,
      [{ base: 'EUR', quote: 'USD', price: '1.1000' }],
      500,
    );
    again.nudge('EUR', 'USD', 10);
    again.rampTo('EUR', 'USD', '1.05', 1);
    again.step(1);
    again.step(2);
    expect(again.price('EUR', 'USD')).toBe(market.price('EUR', 'USD'));
  });
});

describe('WarpClock', () => {
  it('scales elapsed time and jumps without reading the wall clock', () => {
    let real = 0;
    const start = new Date('2026-10-01T00:00:00.000Z');
    const clock = new WarpClock(() => real, start);
    expect(clock.now().toISOString()).toBe('2026-10-01T00:00:00.000Z');
    real = 1000;
    expect(clock.now().getTime()).toBe(start.getTime() + 1000);
    clock.setSpeed(60);
    real = 2000;
    expect(clock.now().getTime()).toBe(start.getTime() + 1000 + 60_000);
    clock.jumpTo(new Date('2026-12-01T00:00:00.000Z'));
    expect(clock.now().toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(clock.warpSpeed).toBe(60);
  });

  it('advances a manual clock by a fixed amount', () => {
    const clock = new ManualClock(Date.parse('2026-10-01T14:00:00.000Z'));
    clock.advance(30 * 60 * 1000);
    expect(clock.now().toISOString()).toBe('2026-10-01T14:30:00.000Z');
  });
});
