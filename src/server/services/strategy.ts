import type { QuoteSummary, QuoteValidity } from '@/contracts/airwallex';
import type { BillDetail } from '@/contracts/api';
import type { BillEventType } from '@/contracts/events';
import { D, decimalString } from '@/contracts/money';
import type { RateSourceKind } from '@/contracts/sse';
import type { CurrentBalance } from '@/server/adapters/balances';
import { instant, parseInstant, type Clock } from '@/server/adapters/clock';
import type { QuoteLock } from '@/server/adapters/quotes';
import { fromDecimal128, toDecimal128 } from '@/server/db/decimal';
import { Bill, BillEvent, Quote, RateTick } from '@/server/db/models';
import { billDetail, type BillReadContext } from '@/server/db/repositories/bills';
import { formatUtcDate } from '@/server/domain/deadline';
import {
  REARM_COOLDOWN_DEMO_MS,
  REARM_COOLDOWN_MS,
  REARM_IMPROVE_BPS,
  acceptLockedPrice,
  evaluateTrigger,
} from '@/server/domain/trigger';
import type { Env } from '@/server/env';
import { enqueueExecution, enqueueQuoteRetry, enqueueStrategy } from '@/server/queue/work';
import { ServiceError, invalid, notFound } from '@/server/services/errors';
import { applyTransition, type EventPublisher } from '@/server/services/transitionBill';

type ExecutionMode = 'TARGET' | 'MANUAL';
type ExpiredPolicy = 'enqueue' | 'throw';

export interface StrategyDeps {
  env: Env;
  clock: Clock;
  quotes: QuoteLock;
  balances: { getBalances(): Promise<CurrentBalance[]> };
  publisher?: EventPublisher;
  demoMode: boolean;
  read?: BillReadContext;
}

interface PriceTick {
  price: string;
  at: Date;
  source: RateSourceKind;
}

interface StrategyDoc {
  targetPrice: { toString(): string };
  feeEstimate: { toString(): string };
  bufferBps: number;
  confirmTicks: number;
  quoteValidityTarget: QuoteValidity;
}

interface OpenBill {
  _id: { toString(): string };
  state: string;
  billCurrency: string;
  billAmount: { toString(): string };
  homeCurrency: string;
  strategy?: StrategyDoc | null;
  trigger?: { consecutiveHits?: number } | null;
  timers?: {
    cooldownUntil?: Date;
    nearMissPrice?: { toString(): string };
  } | null;
  last?: {
    price: { toString(): string };
    at: Date;
    source: RateSourceKind;
  } | null;
}

/** Count a tick. A ready watching bill gets one strategy job for that tick. */
export async function considerTick(input: {
  env: Env;
  clock: Clock;
  billId: string;
  tick: PriceTick & { id: string };
}): Promise<void> {
  const bill = await loadBill(input.billId);
  if (!bill || bill.state !== 'WATCHING' || !bill.strategy) return;
  const outcome = evaluateTrigger({
    now: input.clock.now(),
    tick: input.tick,
    targetPrice: money(bill.strategy.targetPrice),
    bufferBps: bill.strategy.bufferBps,
    confirmTicks: bill.strategy.confirmTicks,
    pollIntervalMs: input.env.POLL_INTERVAL_MS,
    consecutiveHits: bill.trigger?.consecutiveHits ?? 0,
    cooldownUntil: bill.timers?.cooldownUntil,
    lastNearMissPrice: bill.timers?.nearMissPrice ? money(bill.timers.nearMissPrice) : undefined,
    rearmImproveBps: REARM_IMPROVE_BPS,
  });
  const updated = await Bill.updateOne(
    { _id: bill._id, state: 'WATCHING' },
    {
      $set: {
        'trigger.consecutiveHits': outcome.consecutiveHits,
        'trigger.lastEvaluatedTickAt': input.tick.at,
      },
    },
  );
  if (outcome.kind === 'ready' && updated.matchedCount > 0) {
    await enqueueStrategy(input.env.REDIS_URL, input.billId, input.tick.id);
  }
}

/** Lock the quote for a ready tick and move the bill to EXECUTING, or stay watching. */
export async function runStrategyJob(input: StrategyDeps & { billId: string; tickId: string }): Promise<void> {
  const bill = await loadBill(input.billId);
  if (!bill) return;
  if (bill.state === 'EXECUTING') {
    await ensureExecution(input.env, input.billId, 'TARGET');
    return;
  }
  if (bill.state !== 'WATCHING' || !bill.strategy) return;
  const tick = await tickFor(input.tickId, bill);
  if (!tick) return;
  await settleTarget(input, bill, tick, 'enqueue');
}

/** A locked quote died before the transfer existed. Lock another one, still from WATCHING. */
export async function runQuoteRetry(input: StrategyDeps & { billId: string }): Promise<void> {
  const bill = await loadBill(input.billId);
  if (!bill) return;
  if (bill.state === 'EXECUTING') {
    await ensureExecution(input.env, input.billId, 'TARGET');
    return;
  }
  if (bill.state !== 'WATCHING' || !bill.strategy || !bill.last) return;
  await settleTarget(input, bill, lastTick(bill), 'throw');
}

/** Pay now: MIN_1 quote, then execution with mode MANUAL. Watching bills only. */
export async function payBillNow(input: StrategyDeps & { billId: string }): Promise<BillDetail> {
  const bill = await loadBill(input.billId);
  if (!bill) throw notFound();
  if (bill.state === 'EXECUTING') {
    await ensureExecution(input.env, input.billId, 'MANUAL');
    return requireDetail(input, input.billId);
  }
  if (bill.state !== 'WATCHING') {
    throw new ServiceError('INVALID_STATE', 'Pay now is only available while the bill is watching', 409);
  }
  if (!bill.strategy) throw invalid('Set a strategy before paying');
  const quote = await input.quotes.lock({
    buy: bill.billCurrency,
    sell: bill.homeCurrency,
    buyAmount: money(bill.billAmount),
    validity: 'MIN_1',
  });
  if (expired(quote, input.clock)) {
    await remember(bill, input.clock, 'QUOTE_EXPIRED', { quoteId: quote.airwallexQuoteId });
    throw new ServiceError('QUOTE_EXPIRED', 'Quote expired before the transfer was created', 409);
  }
  if (await shortBalance(input.balances, bill, quote)) {
    await Bill.updateOne({ _id: bill._id, state: 'WATCHING' }, { $set: { insufficientBalance: true } });
    throw new ServiceError('INSUFFICIENT_BALANCE', 'The home-currency balance does not cover this payment', 409);
  }
  await storeQuote(bill, quote, 'MANUAL');
  return commit(input, bill, quote, 'MANUAL', 'user', quote.price, false);
}

async function settleTarget(
  deps: StrategyDeps,
  bill: OpenBill,
  tick: PriceTick,
  expiredPolicy: ExpiredPolicy,
): Promise<void> {
  const strategy = bill.strategy;
  if (!strategy) return;
  const hits = bill.trigger?.consecutiveHits ?? 0;
  if (hits < strategy.confirmTicks) return;
  const outcome = evaluateTrigger({
    now: deps.clock.now(),
    tick,
    targetPrice: money(strategy.targetPrice),
    bufferBps: strategy.bufferBps,
    confirmTicks: strategy.confirmTicks,
    pollIntervalMs: deps.env.POLL_INTERVAL_MS,
    consecutiveHits: strategy.confirmTicks - 1,
    cooldownUntil: bill.timers?.cooldownUntil,
    lastNearMissPrice: bill.timers?.nearMissPrice ? money(bill.timers.nearMissPrice) : undefined,
    rearmImproveBps: REARM_IMPROVE_BPS,
  });
  if (outcome.kind !== 'ready') {
    if (outcome.kind === 'miss' || outcome.kind === 'stale') {
      await Bill.updateOne(
        { _id: bill._id, state: 'WATCHING' },
        { $set: { 'trigger.consecutiveHits': 0 } },
      );
    }
    return;
  }
  const quote = await deps.quotes.lock({
    buy: bill.billCurrency,
    sell: bill.homeCurrency,
    buyAmount: money(bill.billAmount),
    validity: strategy.quoteValidityTarget,
  });
  if (expired(quote, deps.clock)) {
    await remember(bill, deps.clock, 'QUOTE_EXPIRED', { quoteId: quote.airwallexQuoteId });
    if (expiredPolicy === 'enqueue') {
      await enqueueQuoteRetry(deps.env.REDIS_URL, String(bill._id));
      return;
    }
    throw new Error('Quote expired before the transfer was created');
  }
  const simulated = tick.source === 'SIMULATED';
  // DEMO-ONLY: a simulated tick is compared with the target; the sandbox quote is still stored.
  // PROD: RATE_SOURCE=airwallex, so acceptLockedPrice compares the quote.
  const accepted = acceptLockedPrice({
    targetPrice: money(strategy.targetPrice),
    quotePrice: quote.price,
    simulated,
    simulatedPrice: tick.price,
  });
  const compared = simulated ? tick.price : quote.price;
  const short = await shortBalance(deps.balances, bill, quote);
  if (!accepted) {
    await nearMiss(deps, bill, compared);
    await flagBalance(bill, short);
    return;
  }
  if (short) {
    await flagBalance(bill, true);
    return;
  }
  await storeQuote(bill, quote, 'TARGET');
  await commit(deps, bill, quote, 'TARGET', 'system', compared, simulated);
}

async function commit(
  deps: StrategyDeps,
  bill: OpenBill,
  quote: QuoteSummary,
  mode: ExecutionMode,
  actor: string,
  price: string,
  simulated: boolean,
): Promise<BillDetail> {
  const detail = await applyTransition({
    billId: String(bill._id),
    event: 'TRIGGER',
    clock: deps.clock,
    actor,
    auditType: 'QUOTE_LOCKED',
    payload: {
      mode,
      price,
      quotePrice: quote.price,
      quoteId: quote.airwallexQuoteId,
      simulated,
    },
    demoMode: deps.demoMode,
    read: deps.read,
    publisher: deps.publisher,
    patch: { insufficientBalance: false },
  });
  await enqueueExecution(deps.env.REDIS_URL, String(bill._id), 1, mode);
  return detail;
}

async function nearMiss(deps: StrategyDeps, bill: OpenBill, price: string): Promise<void> {
  const cooldown = deps.env.DEMO_MODE ? REARM_COOLDOWN_DEMO_MS : REARM_COOLDOWN_MS;
  const until = instant(deps.clock.now().getTime() + cooldown);
  await remember(bill, deps.clock, 'NEAR_MISS', { price }, {
    'timers.cooldownUntil': until,
    'timers.nearMissPrice': toDecimal128(price),
    insufficientBalance: false,
  });
}

async function remember(
  bill: OpenBill,
  clock: Clock,
  type: BillEventType,
  payload: Record<string, unknown>,
  extra?: Record<string, unknown>,
): Promise<void> {
  const audit = { ts: clock.now(), type, actor: 'system', payload };
  const updated = await Bill.updateOne(
    { _id: bill._id, state: 'WATCHING' },
    {
      ...(extra ? { $set: extra } : {}),
      $push: { recentEvents: { $each: [audit], $slice: -20 } },
    },
  );
  if (updated.matchedCount === 0) return;
  await BillEvent.create({ billId: bill._id, ...audit });
}

async function flagBalance(bill: OpenBill, short: boolean): Promise<void> {
  await Bill.updateOne({ _id: bill._id, state: 'WATCHING' }, { $set: { insufficientBalance: short } });
}

async function shortBalance(
  balances: { getBalances(): Promise<CurrentBalance[]> },
  bill: OpenBill,
  quote: QuoteSummary,
): Promise<boolean> {
  const rows = await balances.getBalances();
  const available = rows.find((row) => row.currency === bill.homeCurrency)?.available ?? '0';
  const fee = bill.strategy ? money(bill.strategy.feeEstimate) : '0';
  return D(available).lt(D(quote.sellAmount).plus(fee));
}

async function storeQuote(bill: OpenBill, quote: QuoteSummary, purpose: 'TARGET' | 'MANUAL'): Promise<void> {
  await Quote.create({
    billId: bill._id,
    airwallexQuoteId: quote.airwallexQuoteId,
    purpose,
    validity: quote.validity,
    usage: quote.usage,
    currencyPair: `${bill.billCurrency}${bill.homeCurrency}`,
    conversionDate: parseInstant(`${quote.conversionDate}T00:00:00.000Z`),
    price: toDecimal128(quote.price),
    clientRate: toDecimal128(quote.clientRate),
    ...(quote.midPrice ? { midRate: toDecimal128(quote.midPrice) } : {}),
    buyAmount: toDecimal128(quote.buyAmount),
    sellAmount: toDecimal128(quote.sellAmount),
    validFromAt: parseInstant(quote.validFromAt),
    validToAt: parseInstant(quote.validToAt),
    raw: {},
  });
}

async function ensureExecution(env: Env, billId: string, fallback: ExecutionMode): Promise<void> {
  const quote = await Quote.findOne({ billId }).sort({ validFromAt: -1 }).lean();
  const mode =
    quote?.purpose === 'MANUAL'
      ? 'MANUAL'
      : quote?.purpose === 'DEADLINE' || quote?.purpose === 'AUTOSETTLE'
        ? 'DEADLINE'
        : fallback;
  await enqueueExecution(env.REDIS_URL, billId, 1, mode);
}

async function tickFor(tickId: string, bill: OpenBill): Promise<PriceTick | null> {
  if (tickId.startsWith('edit.')) return bill.last ? lastTick(bill) : null;
  const doc = await RateTick.findOne({ _id: tickId }).lean();
  if (!doc) return null;
  return { price: money(doc.price), at: doc.ts, source: doc.meta.source };
}

function lastTick(bill: OpenBill): PriceTick {
  const last = bill.last;
  if (!last) throw new Error('watching bill has no tick');
  return { price: money(last.price), at: last.at, source: last.source };
}

function expired(quote: QuoteSummary, clock: Clock): boolean {
  return parseInstant(quote.validToAt).getTime() <= clock.now().getTime();
}

async function loadBill(id: string): Promise<OpenBill | null> {
  return Bill.findById(id).lean<OpenBill | null>();
}

async function requireDetail(deps: StrategyDeps, billId: string): Promise<BillDetail> {
  const detail = await billDetail(
    billId,
    deps.demoMode,
    formatUtcDate(deps.clock.now()),
    deps.read,
  );
  if (!detail) throw notFound();
  return detail;
}

function money(value: { toString(): string }): string {
  return decimalString(fromDecimal128(value));
}
