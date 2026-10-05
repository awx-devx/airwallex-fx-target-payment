import type { Job } from 'bullmq';
import { quoteSummarySchema, type QuoteSummary, type QuoteValidity } from '@/contracts/airwallex';
import { instant, type Clock } from '@/server/adapters/clock';
import { toDecimal128 } from '@/server/db/decimal';
import { Bill, BillEvent, Quote, RateTick } from '@/server/db/models';
import { listBills } from '@/server/db/repositories/bills';
import type { Env } from '@/server/env';
import { jobIds, type StrategyPayload } from '@/server/queue';
import { closeWorkQueues, workQueue } from '@/server/queue/work';
import { billContext, cancelBill, closeEventPublisher, putStrategy } from '@/server/services/bills';
import { notificationFor } from '@/server/services/notify';
import { pollWatchingBills } from '@/server/services/pollRates';
import {
  considerTick,
  payBillNow,
  runQuoteRetry,
  runStrategyJob,
  type StrategyDeps,
} from '@/server/services/strategy';
import { bootDb, shutdownDb, watchingBillInput } from '@/server/test/harness';
import { processStrategy } from '@/worker/processors/strategy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const NOW = Date.parse('2026-06-01T12:00:00.000Z');
const clock: Clock = { now: () => instant(NOW) };

describe('strategy engine', () => {
  let env: Env;

  beforeAll(async () => {
    env = await bootDb();
  });

  afterAll(async () => {
    await closeWorkQueues();
    await closeEventPublisher();
    await shutdownDb();
  });

  it('confirms two ticks, locks a quote, and enqueues execution', async () => {
    const bill = await watching('confirm');
    const id = String(bill._id);
    const first = await saveTick('1.1', 'SIMULATED');
    await considerTick({
      env,
      clock,
      billId: id,
      tick: { id: String(first._id), price: '1.1', at: instant(NOW), source: 'SIMULATED' },
    });
    expect(await workQueue('strategy', env.REDIS_URL).getJob(jobIds.trigger(id, String(first._id)))).toBeUndefined();

    const second = await saveTick('1.1', 'SIMULATED');
    await considerTick({
      env,
      clock,
      billId: id,
      tick: { id: String(second._id), price: '1.1', at: instant(NOW), source: 'SIMULATED' },
    });
    expect(await workQueue('strategy', env.REDIS_URL).getJob(jobIds.trigger(id, String(second._id)))).toBeTruthy();

    const notes: string[] = [];
    let validity: QuoteValidity | undefined;
    await runStrategyJob({
      ...deps(),
      billId: id,
      tickId: String(second._id),
      publisher: {
        async publish(event) {
          if (event.type === 'notification') notes.push(event.notification.title);
        },
      },
      quotes: {
        async lock(input) {
          validity = input.validity;
          expect(input.buyAmount).toBe('250000');
          return priced('1.5', { airwallexQuoteId: 'q-confirm' });
        },
      },
    });
    expect(validity).toBe('MIN_1');
    expect(notes).toEqual(['Target hit']);
    expect((await Bill.findById(id).lean())?.state).toBe('EXECUTING');
    expect(await Quote.countDocuments({ billId: id })).toBe(1);
    const execution = await workQueue('execution', env.REDIS_URL).getJob(jobIds.execute(id, 1));
    expect(execution?.data).toMatchObject({ mode: 'TARGET', attempt: 1 });

    await runStrategyJob({ ...deps(), billId: id, tickId: String(second._id) });
    expect(await Quote.countDocuments({ billId: id })).toBe(1);
  });

  it('stays watching on a near miss and starts the cooldown', async () => {
    const bill = await armed('near', 'AIRWALLEX', 1);
    const tick = await saveTick('1.1', 'AIRWALLEX');
    await runStrategyJob({
      ...deps(),
      billId: String(bill._id),
      tickId: String(tick._id),
      quotes: { lock: async () => priced('1.5', { airwallexQuoteId: 'q-near' }) },
    });
    const saved = await Bill.findById(bill._id).lean();
    expect(saved?.state).toBe('WATCHING');
    expect(saved?.timers?.cooldownUntil?.getTime()).toBe(NOW + 120_000);
    expect(await BillEvent.countDocuments({ billId: bill._id, type: 'NEAR_MISS' })).toBe(1);
    expect(await workQueue('execution', env.REDIS_URL).getJob(jobIds.execute(String(bill._id), 1))).toBeUndefined();
  });

  it('stays watching and flags a short balance', async () => {
    const bill = await armed('short', 'AIRWALLEX', 1);
    const tick = await saveTick('1.1', 'AIRWALLEX');
    await runStrategyJob({
      ...deps(),
      billId: String(bill._id),
      tickId: String(tick._id),
      balances: emptyWallet(),
      quotes: { lock: async () => priced('1.1', { airwallexQuoteId: 'q-short' }) },
    });
    const listed = await listBills({}, true, '2026-06-01');
    expect(listed.find((row) => row.id === String(bill._id))?.flags.insufficientBalance).toBe(true);
    expect((await Bill.findById(bill._id).lean())?.state).toBe('WATCHING');
    expect(await Quote.countDocuments({ airwallexQuoteId: 'q-short' })).toBe(0);
  });

  it('retries an expired quote without leaving watching', async () => {
    const bill = await armed('expired', 'AIRWALLEX', 1);
    const id = String(bill._id);
    const tick = await saveTick('1.1', 'AIRWALLEX');
    let calls = 0;
    const quotes = {
      async lock() {
        calls += 1;
        return priced('1.1', {
          airwallexQuoteId: `q-expired-${calls}`,
          validToAt: instant(calls === 1 ? NOW - 1_000 : NOW + 60_000).toISOString(),
        });
      },
    };
    await runStrategyJob({ ...deps(), billId: id, tickId: String(tick._id), quotes });
    expect((await Bill.findById(id).lean())?.state).toBe('WATCHING');
    expect(await BillEvent.countDocuments({ billId: id, type: 'QUOTE_EXPIRED' })).toBe(1);
    expect(await workQueue('quote-retry', env.REDIS_URL).getJob(jobIds.quoteRetry(id))).toBeTruthy();

    await runQuoteRetry({ ...deps(), billId: id, quotes });
    expect((await Bill.findById(id).lean())?.state).toBe('EXECUTING');
    expect((await workQueue('execution', env.REDIS_URL).getJob(jobIds.execute(id, 1)))?.data.mode).toBe('TARGET');
  });

  it('pays now from a one-minute quote', async () => {
    const bill = await watching('pay', {
      strategy: plan(1, 'HR_24'),
      last: { price: toDecimal128('1.4'), at: instant(NOW), source: 'AIRWALLEX' as const },
    });
    const notes: string[] = [];
    const detail = await payBillNow({
      ...deps(),
      billId: String(bill._id),
      publisher: {
        async publish(event) {
          if (event.type === 'notification') notes.push(event.notification.title);
        },
      },
      quotes: {
        async lock(input) {
          expect(input.validity).toBe('MIN_1');
          return priced('1.4', { airwallexQuoteId: 'q-now', validity: 'MIN_1' });
        },
      },
    });
    expect(detail.state).toBe('EXECUTING');
    expect(notes).toEqual(['Paying now']);
    expect((await workQueue('execution', env.REDIS_URL).getJob(jobIds.execute(String(bill._id), 1)))?.data.mode).toBe(
      'MANUAL',
    );
  });

  it('refuses pay now when the wallet is short', async () => {
    const bill = await watching('pay-short');
    await expect(
      payBillNow({
        ...deps(),
        billId: String(bill._id),
        balances: emptyWallet(),
        quotes: { lock: async () => priced('1.1', { airwallexQuoteId: 'q-pay-short' }) },
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    const listed = await listBills({}, true, '2026-06-01');
    expect(listed.find((row) => row.id === String(bill._id))?.flags.insufficientBalance).toBe(true);
  });

  it('re-evaluates a strategy edit on a watching bill', async () => {
    const bill = await watching('edit', {
      strategy: plan(2),
      last: { price: toDecimal128('1.1'), at: instant(NOW), source: 'SIMULATED' as const },
    });
    const detail = await putStrategy(
      String(bill._id),
      { mode: 'TARGET_RATE', targetPrice: '1.2', confirmTicks: 1 },
      billContext(env, clock),
    );
    expect(detail.state).toBe('WATCHING');
    expect(detail.events.some((event) => event.type === 'STRATEGY_UPDATED')).toBe(true);
    expect(
      await workQueue('strategy', env.REDIS_URL).getJob(jobIds.trigger(String(bill._id), `edit.${NOW}`)),
    ).toBeTruthy();
  });

  it('cancels a watching bill', async () => {
    const bill = await watching('cancel');
    const detail = await cancelBill(String(bill._id), billContext(env, clock));
    expect(detail.state).toBe('CANCELLED');
  });

  it('does not evaluate a paused bill', async () => {
    const bill = await watching('paused', { state: 'PAUSED', trigger: { consecutiveHits: 0 } });
    await pollWatchingBills({
      env,
      clock,
      source: { async getIndicative() { return { price: '1.1', source: 'SIMULATED' }; } },
    });
    expect((await Bill.findById(bill._id).lean())?.trigger?.consecutiveHits).toBe(0);
  });

  it('runs the strategy processor against the mock gateway', async () => {
    const at = new Date();
    const tick = await RateTick.create({
      ts: at,
      meta: { base: 'EUR', quote: 'USD', source: 'SIMULATED' },
      price: toDecimal128('1.1'),
    });
    const bill = await watching('processor', {
      trigger: { consecutiveHits: 2 },
      last: { price: toDecimal128('1.1'), at, source: 'SIMULATED' as const },
    });
    await processStrategy({ data: { billId: String(bill._id), tickId: String(tick._id) } } as Job<StrategyPayload>);
    expect((await Bill.findById(bill._id).lean())?.state).toBe('EXECUTING');
  });

  it('names the in-app messages', () => {
    const at = instant(NOW);
    expect(title('QUOTE_LOCKED')).toBe('Target hit');
    expect(title('AUTOSETTLE')).toBe('Paying at the deadline');
    expect(title('PAID')).toBe('Paid');
    expect(title('FAILED')).toBe('Payment failed');
    expect(notificationFor({ billId: 'b', auditType: 'STRATEGY_UPDATED', at })).toBeNull();

    function title(auditType: 'QUOTE_LOCKED' | 'AUTOSETTLE' | 'PAID' | 'FAILED'): string | undefined {
      const event = notificationFor({ billId: 'b', auditType, at });
      return event?.type === 'notification' ? event.notification.title : undefined;
    }
  });

  function deps(): StrategyDeps {
    return {
      env,
      clock,
      demoMode: true,
      quotes: { lock: async () => priced('1.1') },
      balances: {
        async getBalances() {
          return [{ currency: 'USD', available: '1000000000', pending: '0', reserved: '0', total: '1000000000' }];
        },
      },
    };
  }
});

function plan(confirmTicks: number, validity: QuoteValidity = 'MIN_1') {
  return {
    mode: 'TARGET_RATE' as const,
    targetPrice: toDecimal128('1.2'),
    feeEstimate: toDecimal128('0'),
    bufferBps: 0,
    confirmTicks,
    quoteValidityTarget: validity,
    quoteValidityDeadline: 'MIN_1' as const,
    autosettleCutoff: '14:00',
  };
}

function watching(suffix: string, extra: Record<string, unknown> = {}) {
  return Bill.create({
    ...watchingBillInput(suffix),
    strategy: plan(2),
    trigger: { consecutiveHits: 0 },
    last: { price: toDecimal128('1.1'), at: instant(NOW), source: 'SIMULATED' },
    ...extra,
  });
}

function armed(suffix: string, source: 'AIRWALLEX' | 'SIMULATED', confirmTicks: number) {
  return watching(suffix, {
    strategy: plan(confirmTicks),
    trigger: { consecutiveHits: confirmTicks },
    last: { price: toDecimal128('1.1'), at: instant(NOW), source },
  });
}

function saveTick(price: string, source: 'AIRWALLEX' | 'SIMULATED') {
  return RateTick.create({
    ts: instant(NOW),
    meta: { base: 'EUR', quote: 'USD', source },
    price: toDecimal128(price),
  });
}

function priced(price: string, extra: Partial<QuoteSummary> = {}): QuoteSummary {
  return quoteSummarySchema.parse({
    airwallexQuoteId: `q-${price}`,
    price,
    sellAmount: '275000',
    buyAmount: '250000',
    clientRate: price,
    clientRateOriented: price,
    validity: 'MIN_1',
    validFromAt: instant(NOW).toISOString(),
    validToAt: instant(NOW + 60_000).toISOString(),
    usage: 'SINGLE_USE',
    conversionDate: '2026-06-01',
    ...extra,
  });
}

function emptyWallet() {
  return {
    async getBalances() {
      return [{ currency: 'USD', available: '0', pending: '0', reserved: '0', total: '0' }];
    },
  };
}
