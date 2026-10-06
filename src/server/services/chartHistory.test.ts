import { mergeHistory, sessionSpans } from '@/server/services/chartHistory';
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
