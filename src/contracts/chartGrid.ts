import type { ChartSeriesPoint } from '@/contracts/chart';
import { D, significantPrice } from '@/contracts/money';

/** FX is closed from Friday 22:00 UTC until Sunday 22:00 UTC. */
export function fxClosed(unix: number): boolean {
  const date = new Date(unix * 1000);
  const day = date.getUTCDay();
  const seconds = date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds();
  if (day === 6) return true;
  if (day === 5 && seconds >= 22 * 3600) return true;
  if (day === 0 && seconds < 22 * 3600) return true;
  return false;
}

/**
 * Bucket starts on `step`, skipping the FX weekend. Daily steps are Monday
 * to Friday. The bucket that contains `to` is always included.
 */
export function tradingTimes(from: number, to: number, step: number): number[] {
  if (step < 1 || to < from) return [];
  const start = Math.floor(from / step) * step;
  const daily = step >= 86_400;
  const times: number[] = [];
  for (let time = start; time <= to; time += step) {
    if (daily) {
      const day = new Date(time * 1000).getUTCDay();
      if (day === 0 || day === 6) continue;
    } else if (fxClosed(time)) {
      continue;
    }
    times.push(time);
  }
  const endBucket = Math.floor(to / step) * step;
  const last = times[times.length - 1];
  if (endBucket >= start && endBucket <= to && last !== endBucket) times.push(endBucket);
  return times;
}

/** Last value in each bucket, carried forward. Bars before the first point stay empty. */
export function onGrid(
  points: readonly ChartSeriesPoint[],
  step: number,
  times: readonly number[],
): ChartSeriesPoint[] {
  if (times.length === 0 || step < 1) return [];
  const buckets = new Map<number, string>();
  const sorted = [...points].sort((left, right) => left.time - right.time);
  for (const point of sorted) {
    buckets.set(Math.floor(point.time / step) * step, point.value);
  }
  const series: ChartSeriesPoint[] = [];
  let carry: string | undefined;
  for (const time of times) {
    const value = buckets.get(time) ?? carry;
    if (buckets.has(time)) carry = buckets.get(time);
    if (value === undefined) continue;
    series.push({ time, value });
  }
  return series;
}

/** Scale history so the last bar equals the Airwallex spot. No spot leaves the series alone. */
export function scaleToSpot(
  series: readonly ChartSeriesPoint[],
  spot: string | undefined,
): ChartSeriesPoint[] {
  const last = series[series.length - 1];
  if (!spot || !last) return series.map((point) => ({ ...point }));
  const base = D(last.value);
  if (base.isZero()) return series.map((point) => ({ ...point }));
  const factor = D(spot).div(base);
  return series.map((point, index) => ({
    time: point.time,
    value:
      index === series.length - 1
        ? significantPrice(D(spot))
        : significantPrice(D(point.value).mul(factor)),
  }));
}

/** Replace grid bars with these points. A time that is not already a bar is ignored. */
export function stampGrid(
  series: readonly ChartSeriesPoint[],
  points: readonly ChartSeriesPoint[],
  step: number,
): ChartSeriesPoint[] {
  if (points.length === 0 || series.length === 0 || step < 1) return series.map((point) => ({ ...point }));
  const values = new Map(series.map((point) => [point.time, point.value]));
  const sorted = [...points].sort((left, right) => left.time - right.time);
  for (const point of sorted) {
    const bucket = Math.floor(point.time / step) * step;
    if (values.has(bucket)) values.set(bucket, point.value);
  }
  return series.map((point) => ({
    time: point.time,
    value: values.get(point.time) ?? point.value,
  }));
}
