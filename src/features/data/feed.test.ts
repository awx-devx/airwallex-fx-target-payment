import { describe, expect, it } from 'vitest';
import { feedLabel, noteStreamEvent, noteStreamHealth, type FeedLabelState } from '@/features/data/feed';

const live: FeedLabelState = { feed: 'AIRWALLEX', health: 'live' };

describe('feed label', () => {
  it('takes the label from the connect event and ignores tick source', () => {
    const afterTick = noteStreamEvent(live, {
      type: 'tick',
      pair: { base: 'EUR', quote: 'USD' },
      ts: '2026-10-06T00:00:00.000Z',
      price: '1.08',
      source: 'SIMULATED',
    });
    expect(feedLabel(afterTick)).toBe('live');

    const afterHello = noteStreamEvent(live, {
      type: 'hello',
      feed: 'SIMULATED',
      now: '2026-10-06T00:00:00.000Z',
      warp: { speed: 1 },
    });
    expect(feedLabel(afterHello)).toBe('simulated');
    expect(feedLabel(noteStreamEvent(afterHello, {
      type: 'tick',
      pair: { base: 'EUR', quote: 'USD' },
      ts: '2026-10-06T00:00:01.000Z',
      price: '1.09',
      source: 'AIRWALLEX',
    }))).toBe('simulated');
  });

  it('reports health ahead of the feed kind', () => {
    expect(feedLabel(noteStreamHealth({ feed: 'SIMULATED', health: 'live' }, 'delayed'))).toBe('delayed');
    expect(feedLabel(noteStreamHealth(live, 'offline'))).toBe('offline');
  });
});
