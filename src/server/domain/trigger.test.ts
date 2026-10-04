import { acceptLockedPrice, evaluateTrigger } from '@/server/domain/trigger';
import { describe, expect, it } from 'vitest';

const now = new Date('2026-10-05T18:00:00.000Z');

function tick(price: string, ageMs = 0) {
  return {
    price,
    at: new Date(now.getTime() - ageMs),
    source: 'AIRWALLEX' as const,
  };
}

const base = {
  now,
  targetPrice: '1.10',
  bufferBps: 0,
  confirmTicks: 2,
  pollIntervalMs: 10_000,
  consecutiveHits: 0,
  rearmImproveBps: 10,
};

describe('trigger rules', () => {
  it('counts consecutive hits and fires on the confirming tick', () => {
    const first = evaluateTrigger({ ...base, tick: tick('1.10') });
    expect(first).toEqual({ kind: 'counting', consecutiveHits: 1 });
    const second = evaluateTrigger({
      ...base,
      tick: tick('1.09'),
      consecutiveHits: 1,
    });
    expect(second).toEqual({ kind: 'ready', consecutiveHits: 2 });
  });

  it('resets the streak when the price misses or the tick is stale', () => {
    expect(evaluateTrigger({ ...base, tick: tick('1.11'), consecutiveHits: 1 })).toEqual({
      kind: 'miss',
      consecutiveHits: 0,
    });
    expect(evaluateTrigger({ ...base, tick: tick('1.00', 20_000), consecutiveHits: 1 })).toEqual({
      kind: 'stale',
      consecutiveHits: 0,
    });
  });

  it('applies the buffer and ignores reference history', () => {
    expect(
      evaluateTrigger({ ...base, bufferBps: 100, tick: tick('1.09') }).kind,
    ).toBe('miss');
    expect(
      evaluateTrigger({
        ...base,
        tick: { ...tick('1.00'), source: 'REFERENCE' },
        consecutiveHits: 1,
      }),
    ).toEqual({ kind: 'ignored', consecutiveHits: 1 });
  });

  it('holds a cooldown unless the price improves by the re-arm gap', () => {
    const cooldownUntil = new Date(now.getTime() + 60_000);
    expect(
      evaluateTrigger({
        ...base,
        tick: tick('1.05'),
        cooldownUntil,
        lastNearMissPrice: '1.05',
        consecutiveHits: 2,
      }).kind,
    ).toBe('cooldown');
    expect(
      evaluateTrigger({
        ...base,
        tick: tick('1.04'),
        cooldownUntil,
        lastNearMissPrice: '1.05',
      }).kind,
    ).toBe('counting');
  });

  it('accepts a quote at the target, and a simulated tick in place of the quote', () => {
    expect(acceptLockedPrice({ targetPrice: '1.10', quotePrice: '1.10', simulated: false })).toBe(
      true,
    );
    expect(acceptLockedPrice({ targetPrice: '1.10', quotePrice: '1.11', simulated: false })).toBe(
      false,
    );
    expect(
      acceptLockedPrice({
        targetPrice: '1.10',
        quotePrice: '9.00',
        simulated: true,
        simulatedPrice: '1.00',
      }),
    ).toBe(true);
  });
});