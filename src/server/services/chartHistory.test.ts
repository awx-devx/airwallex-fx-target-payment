import { appendSpot, mergeHistory, sessionSpans } from '@/server/services/chartHistory';
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
