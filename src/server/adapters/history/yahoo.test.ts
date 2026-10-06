import { parseAirwallexJson } from '@/server/adapters/airwallex/json';
import { parseYahooChart } from '@/server/adapters/history/yahoo';
import { describe, expect, it } from 'vitest';

const CHART = `{
  "chart": {
    "result": [{
      "timestamp": [100, 400, 700],
      "indicators": { "quote": [{ "close": [1.1000000000000001, null, 1.125] }] }
    }],
    "error": null
  }
}`;

describe('parseYahooChart', () => {
  it('keeps closes as decimal strings and skips nulls', () => {
    expect(parseYahooChart(parseAirwallexJson(CHART))).toEqual([
      { time: 100, close: '1.1000000000000001' },
      { time: 700, close: '1.125' },
    ]);
  });

  it('treats a missing series as an unknown pair', () => {
    expect(
      parseYahooChart({
        chart: { result: null, error: { code: 'Not Found', description: 'No data found' } },
      }),
    ).toBe('unknown');
  });
});
