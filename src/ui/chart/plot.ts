import type { ChartSeriesPoint } from '@/contracts/chart';
import type { UTCTimestamp } from 'lightweight-charts';
import { chartPrice } from '@/ui/chart/scale';

export interface LinePoint {
  time: UTCTimestamp;
  value: number;
}

export interface CandlePoint {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Span {
  from: number;
  to?: number;
}

export function covers(time: number, spans: readonly Span[]): boolean {
  return spans.some((span) => time >= span.from && (span.to === undefined || time <= span.to));
}

export function linePoint(point: ChartSeriesPoint, inverted: boolean): LinePoint {
  return {
    time: point.time as UTCTimestamp,
    value: chartPrice(point.value, inverted),
  };
}

export function candles(points: readonly ChartSeriesPoint[], inverted: boolean): CandlePoint[] {
  return points.map((point, index) => {
    const previous = points[index - 1]?.value ?? point.value;
    const open = chartPrice(previous, inverted);
    const close = chartPrice(point.value, inverted);
    return {
      time: point.time as UTCTimestamp,
      open,
      close,
      high: Math.max(open, close),
      low: Math.min(open, close),
    };
  });
}

export function priceAt(points: readonly ChartSeriesPoint[], time: number): string | undefined {
  let found: string | undefined;
  for (const point of points) {
    if (point.time > time) break;
    found = point.value;
  }
  return found;
}
