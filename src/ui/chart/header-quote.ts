import type { ChartSeriesPoint } from '@/contracts/chart';
import { covers, type Span } from '@/ui/chart/plot';

export type HeaderConnection = 'live' | 'delayed' | 'offline' | 'simulated';

/**
 * Header price and label for one bill.
 * A recorded simulation keeps the last session price, even after later shared ticks.
 */
export function headerQuote(input: {
  series: readonly ChartSeriesPoint[];
  simulated: boolean;
  ranges: readonly Span[];
  stale: boolean;
  connection: HeaderConnection;
}): { price?: string; connection: HeaderConnection } {
  const session = input.simulated ? lastCovered(input.series, input.ranges) : undefined;
  const price = (session ?? input.series[input.series.length - 1])?.value;
  const connection: HeaderConnection = input.simulated
    ? 'simulated'
    : input.stale
      ? 'delayed'
      : input.connection;
  return price === undefined ? { connection } : { price, connection };
}

function lastCovered(
  series: readonly ChartSeriesPoint[],
  ranges: readonly Span[],
): ChartSeriesPoint | undefined {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const point = series[index];
    if (point && covers(point.time, ranges)) return point;
  }
  return undefined;
}
