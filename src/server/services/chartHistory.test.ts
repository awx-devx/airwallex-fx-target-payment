import { appendSpot, composeSeries, mergeHistory, sessionSpans } from '@/server/services/chartHistory';
import { describe, expect, it } from 'vitest';

describe('mergeHistory', () => {
  it('keeps daily reference points and lets a same-day tick replace that close', () => {
    const day = 86_400;
    const merged = mergeHistory(
      [
        { time: day, value: '1.10' },
        { time: day * 2, value: '1.12' },
      ],
      [{ time: day * 2, value: '1.15' }],
    );
    expect(merged).toEqual([
      { time: day, value: '1.10' },
      { time: day * 2, value: '1.15' },
    ]);
  });
});

describe('appendSpot', () => {
  it('adds the live mark when that time is not already on the series', () => {
    expect(appendSpot([{ time: 10, value: '1.10' }], { time: 20, value: '1.12' })).toEqual([
      { time: 10, value: '1.10' },
      { time: 20, value: '1.12' },
    ]);
  });

  it('leaves a series that already has that timestamp', () => {
    const series = [{ time: 10, value: '1.10' }];
    expect(appendSpot(series, { time: 10, value: '1.12' })).toEqual(series);
  });
});

describe('composeSeries', () => {
  it('scales intraday history to the spot and lets a session tick replace its bar', () => {
    const start = Math.floor(Date.parse('2026-10-06T12:00:00.000Z') / 1000);
    const series = composeSeries({
      history: [],
      intraday: [
        { time: start, value: '1.00' },
        { time: start + 300, value: '1.10' },
      ],
      ticks: [{ time: start, value: '9.99' }],
      session: [{ time: start + 300, value: '1.15' }],
      spot: { time: start + 300, value: '1.21' },
      from: start,
      to: start + 300,
      step: 300,
    });
    expect(series.map((point) => point.time)).toEqual([start, start + 300]);
    expect(series[0]?.value).not.toBe('9.99');
    expect(series[1]?.value).toBe('1.21');
  });
});

describe('sessionSpans', () => {
  it('keeps a finished session closed and a running session open', () => {
    expect(
      sessionSpans([
        { type: 'SIM_STARTED', time: 10 },
        { type: 'SIM_ENDED', time: 22 },
        { type: 'SIM_STARTED', time: 40 },
      ]),
    ).toEqual([
      { from: 10, to: 22 },
      { from: 40 },
    ]);
  });
});
