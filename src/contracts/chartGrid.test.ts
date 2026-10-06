import { onGrid, scaleToSpot, tradingTimes } from '@/contracts/chartGrid';
import { describe, expect, it } from 'vitest';

const hour = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe('tradingTimes', () => {
  it('skips the FX weekend and keeps the weekday session', () => {
    const times = tradingTimes(
      hour('2026-10-02T20:00:00.000Z'),
      hour('2026-10-05T02:00:00.000Z'),
      3600,
    );
    expect(times.map((time) => new Date(time * 1000).toISOString())).toEqual([
      '2026-10-02T20:00:00.000Z',
      '2026-10-02T21:00:00.000Z',
      '2026-10-04T22:00:00.000Z',
      '2026-10-04T23:00:00.000Z',
      '2026-10-05T00:00:00.000Z',
      '2026-10-05T01:00:00.000Z',
      '2026-10-05T02:00:00.000Z',
    ]);
  });

  it('includes the bucket that contains now even when the session is closed', () => {
    const saturday = hour('2026-10-03T12:00:30.000Z');
    const times = tradingTimes(hour('2026-10-02T12:00:00.000Z'), saturday, 3600);
    expect(times.at(-1)).toBe(hour('2026-10-03T12:00:00.000Z'));
  });

  it('keeps weekday daily buckets and drops Saturday and Sunday', () => {
    const times = tradingTimes(
      hour('2026-10-02T00:00:00.000Z'),
      hour('2026-10-05T00:00:00.000Z'),
      86_400,
    );
    expect(times.map((time) => new Date(time * 1000).toISOString().slice(0, 10))).toEqual([
      '2026-10-02',
      '2026-10-05',
    ]);
  });
});

describe('onGrid', () => {
  it('keeps the last value in a bucket and carries it across a gap', () => {
    expect(
      onGrid(
        [
          { time: 100, value: '1.00' },
          { time: 250, value: '1.05' },
          { time: 350, value: '1.10' },
        ],
        300,
        [0, 300, 600],
      ),
    ).toEqual([
      { time: 0, value: '1.05' },
      { time: 300, value: '1.10' },
      { time: 600, value: '1.10' },
    ]);
  });
});

describe('scaleToSpot', () => {
  it('ends the series on the Airwallex spot', () => {
    const scaled = scaleToSpot(
      [
        { time: 0, value: '1.00' },
        { time: 300, value: '1.10' },
      ],
      '1.21',
    );
    expect(scaled[1]?.value).toBe('1.21');
    expect(scaled[0]?.value).toBe('1.1');
  });

  it('leaves the series unchanged when there is no spot', () => {
    const series = [{ time: 0, value: '1.00' }];
    expect(scaleToSpot(series, undefined)).toEqual(series);
  });
});
