import type { ChartRange, ChartSeriesPoint } from '@/contracts/chart';
import { tradingTimes } from '@/contracts/chartGrid';
import { D, isDecimalString, significantPrice } from '@/contracts/money';

const DAY = 86_400;
const MAX_FUTURE_BARS = 20_000;
const BARS_1D = 288;
const BARS_5D = 480;

/** How much of a loaded series the range shows. 1D and 5D are bar counts instead. */
const VIEW: Record<Exclude<ChartRange, 'TO_DUE' | 'YTD' | '1D' | '5D'>, number> = {
  '1M': 30 * DAY,
  '3M': 90 * DAY,
  '6M': 183 * DAY,
  '1Y': 365 * DAY,
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

/** Due date plus 10% of the range's visible span, so the deadline stays a fixed fraction of To due. */
export function paddingHorizon(
  range: ChartRange,
  now: number,
  dueDate: number,
  firstTime: number,
): number {
  const visibleFrom =
    range === 'TO_DUE' ? firstTime : range === 'YTD' ? yearStart(now) : now - viewSeconds(range);
  const visibleTo = range === 'TO_DUE' ? dueDate : now;
  const span = Math.max(visibleTo - Math.min(visibleFrom, visibleTo), 1);
  return Math.round(Math.max(dueDate, now) + span * 0.1);
}

function viewSeconds(range: Exclude<ChartRange, 'TO_DUE' | 'YTD'>): number {
  if (range === '1D') return DAY;
  if (range === '5D') return 5 * DAY;
  return VIEW[range];
}

/** Future trading bars after the last point, capped so a far due date cannot explode the axis. */
export function futureTimes(lastTime: number, endTime: number, step: number): number[] {
  if (step < 1 || endTime <= lastTime) return [];
  const times = tradingTimes(lastTime + step, endTime, step);
  return times.length > MAX_FUTURE_BARS ? times.slice(0, MAX_FUTURE_BARS) : times;
}

/**
 * Logical indexes for the bars the range shows. 1D is 288 five-minute bars
 * and 5D is 480 fifteen-minute bars. Older loaded bars stay to the left.
 */
export function visibleLogical(
  range: ChartRange,
  times: readonly number[],
  now: number,
  dueDate: number,
): { from: number; to: number } {
  if (times.length === 0) return { from: 0, to: 1 };
  const nowIndex = lastIndexAtOrBefore(times, now);
  if (range === '1D' || range === '5D') {
    const bars = range === '1D' ? BARS_1D : BARS_5D;
    const from = Math.max(0, nowIndex - (bars - 1));
    return { from, to: nowIndex + rightPad(nowIndex - from) };
  }
  if (range === 'TO_DUE') {
    const dueIndex = firstIndexAtOrAfter(times, dueDate);
    return { from: 0, to: dueIndex + Math.max(1, Math.round(Math.max(dueIndex, 1) * 0.1)) };
  }
  const start = range === 'YTD' ? yearStart(now) : now - VIEW[range];
  const from = Math.min(nowIndex, firstIndexAtOrAfter(times, start));
  return { from, to: nowIndex + rightPad(nowIndex - from) };
}

function rightPad(span: number): number {
  return Math.max(1, Math.round(Math.max(span, 1) * 0.04));
}

/** Low enough that a 90-day hourly span still fits. The due date stays inside if it does not. */
export const MIN_BAR_SPACING = 0.05;

/** Keep `to` (the due date) on screen when the span is wider than the chart. */
export function clampLogicalToWidth(
  view: { from: number; to: number },
  width: number,
  minBarSpacing = MIN_BAR_SPACING,
): { from: number; to: number } {
  if (width <= 0 || minBarSpacing <= 0) return view;
  const span = Math.max(view.to - view.from, 1);
  const maxBars = width / minBarSpacing;
  if (span <= maxBars) return view;
  return { from: view.to - maxBars, to: view.to };
}

/** Logical index of `time`, interpolating between bars. A weekend gap uses the next bar. */
export function gridOffset(
  time: number,
  times: readonly number[],
  step: number,
): number | undefined {
  if (times.length === 0) return undefined;
  const first = times[0];
  const lastIndex = times.length - 1;
  const last = times[lastIndex];
  if (first === undefined || last === undefined) return undefined;
  if (time <= first) return 0;
  if (time >= last) return lastIndex;
  const hi = firstIndexAtOrAfter(times, time);
  const lo = hi - 1;
  const left = times[lo];
  const right = times[hi];
  if (left === undefined || right === undefined) return hi;
  if (time === right) return hi;
  if (step > 0 && right - left > step * 1.5) return hi;
  return lo + (time - left) / (right - left);
}

/** Nearest bar at or beside `time`, so a marker lands on a real grid point. */
export function snapToBar(time: number, times: readonly number[]): number | undefined {
  if (times.length === 0) return undefined;
  const hi = firstIndexAtOrAfter(times, time);
  const at = times[hi];
  const prev = times[hi - 1];
  if (at === undefined) return times[times.length - 1];
  if (prev === undefined) return at;
  return time - prev <= at - time ? prev : at;
}

function lastIndexAtOrBefore(times: readonly number[], target: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] ?? 0) <= target) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

function firstIndexAtOrAfter(times: readonly number[], target: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let found = times.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] ?? 0) >= target) {
      found = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return found;
}

function yearStart(now: number): number {
  const year = new Date(now * 1000).getUTCFullYear();
  return Math.floor(Date.UTC(year, 0, 1) / 1000);
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
