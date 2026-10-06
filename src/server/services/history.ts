import type { ChartSeriesPoint } from '@/contracts/chart';
import { D } from '@/contracts/money';
import { instant, parseInstant } from '@/server/adapters/clock';
import { crossEcb, fetchEcbPerEur } from '@/server/adapters/history/ecb';
import { fetchFrankfurter, type DailyMid } from '@/server/adapters/history/frankfurter';
import { DEMO_ANCHORS } from '@/mocks/market';
import { toDecimal128, fromDecimal128 } from '@/server/db/decimal';
import { ReferenceRate } from '@/server/db/models';
import type { Env } from '@/server/env';
import { getLogger } from '@/server/logging/logger';

const REFERENCE_SOURCES = ['FRANKFURTER', 'ECB'] as const;
type ReferenceSource = (typeof REFERENCE_SOURCES)[number];

export interface ReferenceSeries {
  points: ChartSeriesPoint[];
  /** Both history hosts failed. The chart waits instead of drawing ticks from this session. */
  pending: boolean;
}

/** Daily reference series for a chart. `none` returns nothing. */
export async function referenceSeries(
  env: Env,
  pair: { base: string; quote: string },
  from: string,
  to: string,
): Promise<ReferenceSeries> {
  if (env.HISTORY_SOURCE === 'none') return { points: [], pending: false };
  const points =
    env.HISTORY_SOURCE === 'simulated'
      ? simulatedDaily(pair, from, to)
      : await loadReference(pair, from, to);
  if (points === 'pending') return { points: [], pending: true };
  return {
    points: points.map((point) => ({
      time: Math.floor(Date.parse(`${point.date}T00:00:00.000Z`) / 1000),
      value: point.mid,
    })),
    pending: false,
  };
}

async function loadReference(
  pair: { base: string; quote: string },
  from: string,
  to: string,
): Promise<DailyMid[] | 'pending'> {
  const cached = await cachedReference(pair, from, to);
  if (cached) return cached;
  const frankfurter = await readFrankfurter(pair, from, to);
  if (frankfurter === 'failed') {
    const ecb = await readEcb(pair, from, to);
    if (ecb === 'failed') return 'pending';
    return ecb;
  }
  if (frankfurter.length > 0) return frankfurter;
  const ecb = await readEcb(pair, from, to);
  if (ecb === 'failed') return 'pending';
  return ecb;
}

async function cachedReference(
  pair: { base: string; quote: string },
  from: string,
  to: string,
): Promise<DailyMid[] | undefined> {
  for (const source of REFERENCE_SOURCES) {
    const rows = await ReferenceRate.find({
      base: pair.base,
      quote: pair.quote,
      source,
      date: {
        $gte: parseInstant(`${from}T00:00:00.000Z`),
        $lte: parseInstant(`${to}T00:00:00.000Z`),
      },
    })
      .sort({ date: 1 })
      .lean();
    if (!coversRange(rows, from, to)) continue;
    return rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      mid: fromDecimal128(row.mid).toFixed(),
    }));
  }
  return undefined;
}

async function readFrankfurter(
  pair: { base: string; quote: string },
  from: string,
  to: string,
): Promise<DailyMid[] | 'failed'> {
  try {
    const fetched = await fetchFrankfurter({ base: pair.base, quote: pair.quote, from, to });
    if (fetched.length > 0) {
      await storeReference(pair, fetched, 'FRANKFURTER');
      getLogger().info(
        { base: pair.base, quote: pair.quote, host: 'frankfurter', points: fetched.length },
        'reference history',
      );
    }
    return fetched;
  } catch (error) {
    getLogger().warn(
      { err: error, base: pair.base, quote: pair.quote },
      'frankfurter history failed',
    );
    return 'failed';
  }
}

async function readEcb(
  pair: { base: string; quote: string },
  from: string,
  to: string,
): Promise<DailyMid[] | 'failed'> {
  try {
    const perEur = await fetchEcbPerEur({
      currencies: [pair.base, pair.quote],
      from,
      to,
    });
    const fetched = crossEcb(pair, perEur);
    if (fetched.length > 0) {
      await storeReference(pair, fetched, 'ECB');
      getLogger().info(
        { base: pair.base, quote: pair.quote, host: 'ecb', points: fetched.length },
        'reference history',
      );
    }
    return fetched;
  } catch (error) {
    getLogger().warn({ err: error, base: pair.base, quote: pair.quote }, 'ecb history failed');
    return 'failed';
  }
}

async function storeReference(
  pair: { base: string; quote: string },
  points: readonly DailyMid[],
  source: ReferenceSource,
): Promise<void> {
  for (const point of points) {
    await ReferenceRate.updateOne(
      {
        base: pair.base,
        quote: pair.quote,
        date: parseInstant(`${point.date}T00:00:00.000Z`),
        source,
      },
      { $setOnInsert: { mid: toDecimal128(point.mid) } },
      { upsert: true },
    );
  }
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
