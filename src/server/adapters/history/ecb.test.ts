import { D } from '@/contracts/money';
import { crossEcb, parseEcbCsv } from '@/server/adapters/history/ecb';
import { describe, expect, it } from 'vitest';

const CSV = [
  'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-07-08,1.16',
  'EXR.D.GBP.EUR.SP00.A,D,GBP,EUR,SP00,A,2026-07-08,0.85',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-07-09,1.15',
  'EXR.D.GBP.EUR.SP00.A,D,GBP,EUR,SP00,A,2026-07-09,0.86,A,F,,,,"ECB reference exchange rate, pound sterling/Euro"',
].join('\n');

describe('parseEcbCsv', () => {
  it('reads currency, date, and the euro rate', () => {
    expect(parseEcbCsv(CSV)).toEqual([
      { currency: 'USD', date: '2026-07-08', perEur: '1.16' },
      { currency: 'GBP', date: '2026-07-08', perEur: '0.85' },
      { currency: 'USD', date: '2026-07-09', perEur: '1.15' },
      { currency: 'GBP', date: '2026-07-09', perEur: '0.86' },
    ]);
  });
});

describe('crossEcb', () => {
  const perEur = new Map<string, Map<string, string>>([
    ['USD', new Map([['2026-07-08', '1.16'], ['2026-07-09', '1.15']])],
    ['GBP', new Map([['2026-07-08', '0.85'], ['2026-07-09', '0.86']])],
  ]);

  it('uses the quote series when the base is EUR', () => {
    expect(crossEcb({ base: 'EUR', quote: 'USD' }, perEur)).toEqual([
      { date: '2026-07-08', mid: '1.16' },
      { date: '2026-07-09', mid: '1.15' },
    ]);
  });

  it('inverts the base series when the quote is EUR', () => {
    const mid = crossEcb({ base: 'USD', quote: 'EUR' }, perEur)[0]?.mid ?? '0';
    expect(D(mid).toFixed(4)).toBe('0.8621');
  });

  it('crosses two non-euro currencies into quote per base', () => {
    const points = crossEcb({ base: 'GBP', quote: 'USD' }, perEur);
    expect(points.map((point) => point.date)).toEqual(['2026-07-08', '2026-07-09']);
    expect(D(points[0]?.mid ?? '0').toFixed(4)).toBe('1.3647');
    expect(D(points[1]?.mid ?? '0').toFixed(4)).toBe('1.3372');
  });
});
