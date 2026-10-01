import type { ChartOverlays, ChartSeriesPoint } from '@/contracts/chart';
import { D, significantPrice } from '@/contracts/money';
import { SimulatedMarket } from '@/mocks/market';

export const NOW = Math.floor(Date.parse('2026-10-01T12:00:00.000Z') / 1000);
export const DAY = 86_400;
export const PAIR = { base: 'EUR', quote: 'USD' } as const;
export const JPY = { base: 'JPY', quote: 'USD' } as const;
export const NOTIONAL = { amount: '250000', currency: 'USD' };
export const NOW_ISO = '2026-10-01T12:00:00.000Z';

export function seriesEnding(
  endPrice: string,
  count = 120,
  stepSeconds = 3600,
  gap = '0.012',
): ChartSeriesPoint[] {
  const points: ChartSeriesPoint[] = [];
  let price = D(endPrice).plus(gap);
  for (let index = 0; index < count; index += 1) {
    const toward = D(endPrice).minus(price).mul('0.035');
    const wave = D(Math.sin(index / 7).toFixed(6)).mul(D(gap).mul('0.06'));
    price = price.plus(toward).plus(wave);
    if (!price.greaterThan('0.0001')) price = D('0.0001');
    points.push({
      time: NOW - (count - 1 - index) * stepSeconds,
      value: significantPrice(price),
    });
  }
  const last = points[points.length - 1];
  if (last) points[points.length - 1] = { time: last.time, value: endPrice };
  return points;
}

export function referenceOf(series: readonly ChartSeriesPoint[]): ChartSeriesPoint[] {
  return series.map((point) => ({
    time: point.time,
    value: significantPrice(D(point.value).plus('0.0014')),
  }));
}

export function baseOverlays(
  series: readonly ChartSeriesPoint[],
  patch: Partial<ChartOverlays> = {},
): ChartOverlays {
  const first = series[0]?.time ?? NOW;
  return {
    entry: '1.09400',
    target: '1.07500',
    executionDeadline: NOW + 12 * DAY,
    dueDate: NOW + 16 * DAY,
    now: NOW,
    markers: [{ time: first, kind: 'ARMED' }],
    ...patch,
  };
}

export const WATCHING = seriesEnding('1.09000');
export const APPROACHING = seriesEnding('1.07720');
export const HIT = seriesEnding('1.07240');
export const BOUNCE = seriesEnding('1.08350');
export const SETTLED = seriesEnding('1.07410');
export const PAID = seriesEnding('1.07300');
export const JPY_SERIES = seriesEnding('0.00680', 80, 3600, '0.0004');

export const LIVE_SERIES = seriesEnding('1.08620', 5000, 1);

export function createEurMarket(): SimulatedMarket {
  return new SimulatedMarket(11, [
    { base: 'EUR', quote: 'USD', price: '1.08620', vol: '0.0005' },
  ]);
}
