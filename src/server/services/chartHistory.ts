import type { ChartSeriesPoint } from '@/contracts/chart';

/** Closed or still-running Simulate sessions, from `SIM_STARTED` / `SIM_ENDED` events. */
export function sessionSpans(
  events: readonly { type: string; time: number }[],
): { from: number; to?: number }[] {
  const ranges: { from: number; to?: number }[] = [];
  let open: number | undefined;
  for (const event of events) {
    if (event.type === 'SIM_STARTED') {
      if (open !== undefined) ranges.push({ from: open });
      open = event.time;
    } else if (event.type === 'SIM_ENDED' && open !== undefined) {
      ranges.push({ from: open, to: event.time });
      open = undefined;
    }
  }
  if (open !== undefined) ranges.push({ from: open });
  return ranges;
}

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

/** The live Airwallex mark on the right edge, when that timestamp is not already a tick. */
export function appendSpot(
  series: readonly ChartSeriesPoint[],
  spot: { time: number; value: string } | undefined,
): ChartSeriesPoint[] {
  if (!spot || series.some((point) => point.time === spot.time)) return [...series];
  return [...series, { time: spot.time, value: spot.value }].sort(
    (left, right) => left.time - right.time,
  );
}
