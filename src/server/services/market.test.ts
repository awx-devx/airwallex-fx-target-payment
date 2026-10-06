import { SystemClock } from '@/server/adapters/clock';
import { parseFrankfurter } from '@/server/adapters/history/frankfurter';
import type { RateSource } from '@/server/adapters/rates';
import { dropForBackpressure } from '@/server/events/hub';
import { toDecimal128 } from '@/server/db/decimal';
import { Bill, RateCandle, RateTick } from '@/server/db/models';
import { parseEnv } from '@/server/env';
import { listBills } from '@/server/db/repositories/bills';
import { rollupMinute } from '@/server/services/candles';
import { billChart } from '@/server/services/chart';
import { pollWatchingBills } from '@/server/services/pollRates';
import { bootDb, shutdownDb, watchingBillInput } from '@/server/test/harness';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const NOW = Date.parse('2026-10-05T12:00:30.000Z');

describe('market data', () => {
  beforeAll(async () => {
    await bootDb();
  });

  afterAll(async () => {
    await shutdownDb();
  });

  it('coalesces one rate call per pair and amount and draws it on the chart', async () => {
    const env = parseEnv({ ...process.env, HISTORY_SOURCE: 'none', RATE_SOURCE: 'simulated' });
    const clock = new SystemClock(() => NOW);
    const first = await Bill.create(watchingBillInput('mkt-a'));
    const second = await Bill.create(watchingBillInput('mkt-b'));
    await Bill.create({ ...watchingBillInput('mkt-c'), billAmount: toDecimal128('100') });
    let calls = 0;
    const source: RateSource = {
      async getIndicative(input) {
        calls += 1;
        return { price: input.buyAmount === '100' ? '1.10' : '1.20', source: 'SIMULATED' };
      },
    };
    const events: string[] = [];
    await pollWatchingBills({
      env,
      clock,
      source,
      publish: async (event) => {
        if (event.type === 'tick') events.push(event.billId ?? '');
      },
    });
    expect(calls).toBe(2);
    expect(await RateTick.countDocuments({ 'meta.base': 'EUR', 'meta.quote': 'USD' })).toBe(2);
    const loaded = await Bill.findById(first._id).lean();
    const other = await Bill.findById(second._id).lean();
    expect(loaded?.last?.price.toString()).toBe(other?.last?.price.toString());
    expect(events).toHaveLength(3);

    const chart = await billChart({ billId: String(first._id), range: '1D', env, clock });
    expect(chart.series.length).toBeGreaterThan(0);
    expect(chart.overlays.now).toBe(Math.floor(NOW / 1000));
    expect(chart.reference).toBeUndefined();

    await Bill.collection.updateOne(
      { _id: first._id },
      { $set: { 'last.at': new Date(NOW - 120_000), updatedAt: new Date(NOW) } },
    );
    const held = await listBills({}, true, '2026-10-05', {
      nowMs: NOW + 1_000,
      pollIntervalMs: 10_000,
      historySource: 'none',
    });
    expect(held.find((bill) => bill.id === String(first._id))?.flags.stale).toBe(false);

    await Bill.collection.updateOne(
      { _id: first._id },
      { $set: { 'last.at': new Date(NOW), updatedAt: new Date(NOW) } },
    );
    const listed = await listBills({}, true, '2026-10-05', {
      nowMs: NOW + 60_000,
      pollIntervalMs: 10_000,
      historySource: 'none',
    });
    const row = listed.find((bill) => bill.id === String(first._id));
    expect(row?.flags.stale).toBe(true);
    expect(row?.flags.noReferenceHistory).toBe(true);
  });

  it('rolls the previous minute of ticks into a candle', async () => {
    const minute = Date.parse('2026-10-05T11:58:00.000Z');
    await RateTick.create({
      ts: new Date(minute + 1_000),
      meta: { base: 'GBP', quote: 'USD', source: 'SIMULATED' },
      price: toDecimal128('1.27'),
    });
    await RateTick.create({
      ts: new Date(minute + 2_000),
      meta: { base: 'GBP', quote: 'USD', source: 'SIMULATED' },
      price: toDecimal128('1.28'),
    });
    const written = await rollupMinute(new Date(minute + 60_000));
    expect(written).toBe(1);
    const candle = await RateCandle.findOne({ base: 'GBP', quote: 'USD' }).lean();
    expect(candle?.o.toString()).toBe('1.27');
    expect(candle?.c.toString()).toBe('1.28');
  });

  it('parses a Frankfurter series and drops a backed-up stream event', () => {
    const points = parseFrankfurter(
      { rates: { '2026-10-02': { USD: '1.085' }, '2026-10-01': { USD: '1.08' } } },
      'USD',
    );
    expect(points.map((point) => point.date)).toEqual(['2026-10-01', '2026-10-02']);
    expect(dropForBackpressure(0)).toBe(true);
    expect(dropForBackpressure(1)).toBe(false);
  });
});
