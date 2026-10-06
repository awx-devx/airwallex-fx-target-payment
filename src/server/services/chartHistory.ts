import type { ChartSeriesPoint } from '@/contracts/chart';

/** ECB daily mids, with our own ticks winning when the timestamp matches. */
export function mergeHistory(
  reference: readonly ChartSeriesPoint[],
  ticks: readonly ChartSeriesPoint[],
): ChartSeriesPoint[] {
  const merged = new Map<number, string>();
  for (const point of reference) merged.set(point.time, point.value);
  for (const tick of ticks) merged.set(tick.time, tick.value);
  return [...merged.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([time, value]) => ({ time, value }));
}
