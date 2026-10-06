import { describe, expect, it } from 'vitest';
import { headerQuote } from '@/ui/chart/header-quote';

const series = [
  { time: 100, value: '1.10' },
  { time: 200, value: '1.05' },
  { time: 300, value: '1.12' },
];

describe('headerQuote', () => {
  it('uses the feed label and the latest point when the bill was not simulated', () => {
    expect(
      headerQuote({
        series,
        simulated: false,
        ranges: [{ from: 150, to: 250 }],
        stale: false,
        connection: 'live',
      }),
    ).toEqual({ price: '1.12', connection: 'live' });
  });

  it('keeps the last session price and the Simulated label on a recorded simulation', () => {
    expect(
      headerQuote({
        series,
        simulated: true,
        ranges: [{ from: 150, to: 250 }],
        stale: false,
        connection: 'live',
      }),
    ).toEqual({ price: '1.05', connection: 'simulated' });
  });

  it('dims a stale shared feed', () => {
    expect(
      headerQuote({
        series,
        simulated: false,
        ranges: [],
        stale: true,
        connection: 'live',
      }).connection,
    ).toBe('delayed');
  });
});
