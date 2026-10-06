import { describe, expect, it } from 'vitest';
import { watchingFeedStale } from '@/server/domain/feedAge';

const now = Date.parse('2026-10-06T12:00:00.000Z');
const interval = 10_000;

describe('watchingFeedStale', () => {
  it('stays live when the bill was written inside two poll intervals', () => {
    expect(
      watchingFeedStale({
        state: 'WATCHING',
        lastTickAt: new Date(now - 120_000).toISOString(),
        updatedAtMs: now - 1_000,
        nowMs: now,
        pollIntervalMs: interval,
      }),
    ).toBe(false);
  });

  it('is stale once the tick and the write are both older than two intervals', () => {
    expect(
      watchingFeedStale({
        state: 'WATCHING',
        lastTickAt: new Date(now - 60_000).toISOString(),
        updatedAtMs: now - 60_000,
        nowMs: now,
        pollIntervalMs: interval,
      }),
    ).toBe(true);
  });

  it('ignores bills that are not being watched', () => {
    expect(
      watchingFeedStale({
        state: 'READY',
        lastTickAt: new Date(now - 120_000).toISOString(),
        updatedAtMs: now - 120_000,
        nowMs: now,
        pollIntervalMs: interval,
      }),
    ).toBe(false);
  });
});
