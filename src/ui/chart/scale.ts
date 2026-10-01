import type { ChartRange, ChartSeriesPoint } from '@/contracts/chart';
import { D, isDecimalString, significantPrice } from '@/contracts/money';

const DAY = 86_400;

const WINDOW: Record<Exclude<ChartRange, 'TO_DUE'>, number> = {
  '1D': DAY,
  '5D': 5 * DAY,
  '1M': 30 * DAY,
  '3M': 90 * DAY,
};

/**
 * Lightweight Charts plots JS numbers. Convert a canonical decimal string at
 * this boundary. `inverted` plots `1/p`.
 */
export function chartPrice(value: string, inverted = false): number {
  const price = inverted ? D('1').div(D(value)) : D(value);
  return price.toNumber();
}

/** Map a chart coordinate back to a canonical decimal string. */
export function canonicalFromChart(displayed: number, inverted = false): string {
  const text = trimFixed(displayed);
  if (!isDecimalString(text)) return '0';
  const parsed = D(text);
  const canonical = inverted ? D('1').div(parsed) : parsed;
  return significantPrice(canonical);
}

/** Due date plus 10% of the span from the first point, so deadline lines stay on screen. */
export function whitespaceEnd(firstTime: number, dueDate: number): number {
  const span = Math.max(dueDate - firstTime, 1);
  return Math.round(dueDate + span * 0.1);
}

const MAX_PADDING_POINTS = 480;

/** Typical spacing of a series, used to extend the axis without inventing ticks. */
export function seriesStep(series: readonly { time: number }[]): number {
  const first = series[0];
  const last = series[series.length - 1];
  if (!first || !last || series.length < 2) return 3600;
  return Math.max(1, Math.round((last.time - first.time) / (series.length - 1)));
}

/**
 * Future times so Lightweight Charts can place deadline, due, and now lines.
 * The scale is bar-index based, so the gap is filled at the series step
 * (capped) and the exact overlay times are included.
 */
export function paddingTimes(
  lastTime: number,
  endTime: number,
  stepSeconds: number,
  extras: readonly number[],
): number[] {
  const times = new Set<number>();
  for (const extra of extras) {
    if (extra > lastTime) times.add(extra);
  }
  if (endTime > lastTime) {
    const span = endTime - lastTime;
    const step = Math.max(1, stepSeconds);
    const count = Math.ceil(span / step);
    const stride = count > MAX_PADDING_POINTS ? Math.ceil(span / MAX_PADDING_POINTS) : step;
    for (let time = lastTime + stride; time < endTime; time += stride) times.add(time);
    times.add(endTime);
  }
  return [...times].sort((left, right) => left - right);
}

export function visibleWindow(
  range: ChartRange,
  now: number,
  firstTime: number,
  dueDate: number,
): { from: number; to: number } {
  const end = whitespaceEnd(firstTime, dueDate);
  if (range === 'TO_DUE') return { from: firstTime, to: end };
  const from = Math.min(now, Math.max(firstTime, now - WINDOW[range]));
  return { from, to: Math.max(now, from + 1) };
}

export type SeriesChange = 'same' | 'update' | 'replace';

/** A single appended tick can use `series.update` instead of replacing 5k points. */
export function seriesChange(
  previous: readonly ChartSeriesPoint[],
  next: readonly ChartSeriesPoint[],
): SeriesChange {
  if (
    previous.length === next.length &&
    previous.every(
      (point, index) =>
        point.time === next[index]?.time && point.value === next[index]?.value,
    )
  ) {
    return 'same';
  }
  if (
    previous.length > 0 &&
    next.length === previous.length + 1 &&
    previous.every(
      (point, index) =>
        point.time === next[index]?.time && point.value === next[index]?.value,
    )
  ) {
    return 'update';
  }
  return 'replace';
}

export function sameUtcDay(left: number, right: number): boolean {
  const a = new Date(left * 1000);
  const b = new Date(right * 1000);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function trimFixed(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(12).replace(/\.?0+$/, '');
}
