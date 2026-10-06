import type { ChartSeriesPoint } from '@/contracts/chart';
import { D } from '@/contracts/money';
import { instant, parseInstant } from '@/server/adapters/clock';
import { fetchFrankfurter, type DailyMid } from '@/server/adapters/history/frankfurter';
import { DEMO_ANCHORS } from '@/mocks/market';
import { toDecimal128, fromDecimal128 } from '@/server/db/decimal';
import { ReferenceRate } from '@/server/db/models';
import type { Env } from '@/server/env';

/** Daily reference series for a chart. `none` returns nothing. */
export async function referenceSeries(
  env: Env,
  pair: { base: string; quote: string },
  from: string,
  to: string,
): Promise<ChartSeriesPoint[]> {
  if (env.HISTORY_SOURCE === 'none') return [];
  const points = env.HISTORY_SOURCE === 'simulated' ? simulatedDaily(pair, from, to) : await cachedFrankfurter(pair, from, to);
  return points.map((point) => ({
    time: Math.floor(Date.parse(`${point.date}T00:00:00.000Z`) / 1000),
    value: point.mid,
  }));
}

async function cachedFrankfurter(
  pair: { base: string; quote: string },
  from: string,
  to: string,
): Promise<DailyMid[]> {
  const cached = await ReferenceRate.find({
    base: pair.base,
    quote: pair.quote,
    source: 'FRANKFURTER',
    date: { $gte: parseInstant(`${from}T00:00:00.000Z`), $lte: parseInstant(`${to}T00:00:00.000Z`) },
  })
    .sort({ date: 1 })
    .lean();
  if (coversRange(cached, from, to)) {
    return cached.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      mid: fromDecimal128(row.mid).toFixed(),
    }));
  }
  let fetched: DailyMid[] = [];
  try {
    fetched = await fetchFrankfurter({ base: pair.base, quote: pair.quote, from, to });
  } catch {
    return cached.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      mid: fromDecimal128(row.mid).toFixed(),
    }));
  }
  for (const point of fetched) {
    await ReferenceRate.updateOne(
      { base: pair.base, quote: pair.quote, date: parseInstant(`${point.date}T00:00:00.000Z`), source: 'FRANKFURTER' },
      { $setOnInsert: { mid: toDecimal128(point.mid) } },
      { upsert: true },
    );
  }
  return fetched;
}

/** A short cached slice must not hide the rest of the requested window. */
function coversRange(
  cached: readonly { date: Date }[],
  from: string,
  to: string,
): boolean {
  const first = cached[0];
  const last = cached[cached.length - 1];
  if (!first || !last) return false;
  const slack = 4 * 86_400_000;
  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  return first.date.getTime() <= fromMs + slack && last.date.getTime() >= toMs - slack;
}

function simulatedDaily(pair: { base: string; quote: string }, from: string, to: string): DailyMid[] {
  const anchor = DEMO_ANCHORS.find((item) => item.base === pair.base && item.quote === pair.quote);
  const mid = D(anchor?.price ?? '1').toFixed();
  const points: DailyMid[] = [];
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  for (let at = start; at <= end; at += 86_400_000) {
    points.push({ date: instant(at).toISOString().slice(0, 10), mid });
  }
  return points;
}
