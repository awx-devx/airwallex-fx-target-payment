import type { ArmBody, BillDetail, PatchBillBody, PutStrategyBody, StrategyDetail } from '@/contracts/api';
import type { BillSummary } from '@/contracts/bill';
import type { QuoteValidity } from '@/contracts/airwallex';
import { D, decimalString } from '@/contracts/money';
import { currentBalances } from '@/server/adapters/balances';
import { parseInstant, SystemClock, type Clock } from '@/server/adapters/clock';
import { quoteLock } from '@/server/adapters/quotes';
import { publish } from '@/server/events/bus';
import type { Env } from '@/server/env';
import { Redis } from 'ioredis';
import { fromDecimal128, toDecimal128 } from '@/server/db/decimal';
import { Beneficiary, Bill, RateTick, User } from '@/server/db/models';
import { billDetail, listBills, type BillListQuery, type BillReadContext } from '@/server/db/repositories/bills';
import {
  accountDate,
  defaultLeadDays,
  executionSchedule,
  formatUtcDate,
  utcDateOnly,
} from '@/server/domain/deadline';
import { targetPriceFromMaxCost } from '@/server/domain/rateMath';
import { REARM_IMPROVE_BPS, evaluateTrigger } from '@/server/domain/trigger';
import mongoose from 'mongoose';
import { invalid, notFound, ServiceError } from '@/server/services/errors';
import { currentPairPrice, sharedPairTicks } from '@/server/services/pairPrice';
import { conversionSkipDates } from '@/server/services/reference';
import { enqueueStrategy } from '@/server/queue/work';
import { notePastDeadlinePayment } from '@/server/services/deadline';
import { cancelInFlightTransfer } from '@/server/services/execution';
import { transferGateway } from '@/server/adapters/transfers';
import { safetyNetGateway, type SafetyNetGateway } from '@/server/services/safetyNet';
import { payBillNow } from '@/server/services/strategy';
import { applyTransition, type EventPublisher } from '@/server/services/transitionBill';
import { assertTransferValid } from '@/server/services/transferValidation';

const DEMO_EMAIL = 'demo@example.com';
const EDITABLE = new Set(['DRAFT', 'READY', 'FAILED']);

export interface BillContext {
  clock: Clock;
  accountTz: string;
  cutoff: string;
  env: Env;
  demoMode: boolean;
  paymentsGateway: Env['PAYMENTS_GATEWAY'];
  pollIntervalMs: number;
  defaults: {
    bufferBps: number;
    confirmTicks: number;
    quoteValidityTarget: QuoteValidity;
    quoteValidityDeadline: QuoteValidity;
  };
  publisher?: EventPublisher;
  safetyNet?: SafetyNetGateway | null;
}

export function listBillSummaries(
  query: BillListQuery,
  demoMode: boolean,
  today: string,
  read?: BillReadContext,
): Promise<BillSummary[]> {
  return listBills(query, demoMode, today, read);
}

export async function getBill(
  id: string,
  demoMode: boolean,
  today: string,
  read?: BillReadContext,
): Promise<BillDetail> {
  if (!mongoose.isValidObjectId(id)) throw notFound();
  const detail = await billDetail(id, demoMode, today, read);
  if (!detail) throw notFound();
  return detail;
}

export function billReadContext(env: Env, clock: Clock = new SystemClock()): BillReadContext {
  return {
    nowMs: clock.now().getTime(),
    pollIntervalMs: env.POLL_INTERVAL_MS,
    historySource: env.HISTORY_SOURCE,
  };
}

export async function patchBill(id: string, body: PatchBillBody, ctx: BillContext): Promise<BillDetail> {
  const bill = await requireDoc(id);
  if (!EDITABLE.has(bill.state)) {
    throw new ServiceError('INVALID_STATE', `${bill.state} cannot be edited`, 409);
  }
  const currencyChange = Boolean(body.billCurrency && body.billCurrency !== bill.billCurrency);
  if (currencyChange) {
    if (bill.state !== 'DRAFT') throw invalid('Currency can only change on a draft');
    if (body.billCurrency === bill.homeCurrency) throw invalid('Choose a foreign bill currency');
  }
  const billCurrency = currencyChange && body.billCurrency ? body.billCurrency : bill.billCurrency;
  const transferMethod = body.transferMethod ?? bill.transferMethod;
  const leadDays = body.transferMethod ? defaultLeadDays(body.transferMethod) : bill.leadDays;
  const dueDate = body.dueDate ?? formatUtcDate(bill.dueDate);
  const schedule =
    body.dueDate || body.transferMethod || currencyChange
      ? executionSchedule({
          dueDate,
          leadDays,
          skip: await conversionSkipDates(ctx, billCurrency, bill.homeCurrency),
          cutoff: bill.strategy?.autosettleCutoff ?? ctx.cutoff,
          timeZone: ctx.accountTz,
        })
      : undefined;
  const updated = await Bill.findOneAndUpdate(
    { _id: bill._id, state: bill.state, version: bill.version },
    {
      $set: {
        ...(body.vendorName ? { vendorName: body.vendorName } : {}),
        ...(body.invoiceNumber ? { invoiceNumber: body.invoiceNumber } : {}),
        ...(body.amount ? { billAmount: toDecimal128(body.amount) } : {}),
        ...(body.dueDate ? { dueDate: utcDateOnly(body.dueDate) } : {}),
        ...(body.reference ? { reference: body.reference } : {}),
        ...(body.transferReason ? { transferReason: body.transferReason } : {}),
        ...(body.transferMethod ? { transferMethod, leadDays } : {}),
        ...(currencyChange ? { billCurrency } : {}),
        ...(schedule
          ? {
              executionDeadline: utcDateOnly(schedule.executionDeadline),
              'timers.autosettleAt': schedule.autosettleAt,
              ...(schedule.autosettleAt.getTime() > ctx.clock.now().getTime()
                ? { 'timers.autosettleFiredAt': null }
                : {}),
            }
          : {}),
      },
      ...(currencyChange ? { $unset: { last: '' } } : {}),
      $inc: { version: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!updated) throw new ServiceError('INVALID_STATE', 'Bill changed concurrently', 409);
  return getBill(id, ctx.demoMode, accountDate(ctx.clock.now(), ctx.accountTz), billReadContext(ctx.env, ctx.clock));
}

export async function putStrategy(
  id: string,
  body: PutStrategyBody,
  ctx: BillContext,
): Promise<BillDetail> {
  const bill = await requireDoc(id);
  const fee = bill.strategy ? moneyOf(bill.strategy.feeEstimate) : '0';
  const targetPrice = resolveTarget(body, moneyOf(bill.billAmount), fee);
  if (!D(targetPrice).gt(0)) throw invalid('Target price must be positive');
  const strategy: StrategyDetail = {
    mode: body.mode,
    targetPrice,
    feeEstimate: fee,
    bufferBps: body.bufferBps ?? bill.strategy?.bufferBps ?? ctx.defaults.bufferBps,
    confirmTicks: body.confirmTicks ?? bill.strategy?.confirmTicks ?? ctx.defaults.confirmTicks,
    quoteValidityTarget:
      body.quoteValidityTarget ?? bill.strategy?.quoteValidityTarget ?? ctx.defaults.quoteValidityTarget,
    quoteValidityDeadline:
      body.quoteValidityDeadline ??
      bill.strategy?.quoteValidityDeadline ??
      ctx.defaults.quoteValidityDeadline,
    autosettleCutoff: body.autosettleCutoff ?? bill.strategy?.autosettleCutoff ?? ctx.cutoff,
    ...(body.mode === 'MAX_COST' && body.maxCost ? { maxCost: body.maxCost } : {}),
  };
  let consecutiveHits = bill.trigger?.consecutiveHits ?? 0;
  let triggerReady = false;
  if (bill.state === 'WATCHING' && bill.last) {
    const outcome = evaluateTrigger({
      now: ctx.clock.now(),
      tick: { price: moneyOf(bill.last.price), at: bill.last.at, source: bill.last.source },
      targetPrice,
      bufferBps: strategy.bufferBps,
      confirmTicks: strategy.confirmTicks,
      pollIntervalMs: ctx.pollIntervalMs,
      consecutiveHits,
      cooldownUntil: bill.timers?.cooldownUntil ?? undefined,
      lastNearMissPrice: bill.timers?.nearMissPrice ? moneyOf(bill.timers.nearMissPrice) : undefined,
      rearmImproveBps: REARM_IMPROVE_BPS,
    });
    consecutiveHits = outcome.consecutiveHits;
    triggerReady = outcome.kind === 'ready';
  }
  const detail = await applyTransition({
    billId: id,
    event: 'SET_STRATEGY',
    clock: ctx.clock,
    actor: 'user',
    auditType: 'STRATEGY_UPDATED',
    payload: { mode: strategy.mode, targetPrice, consecutiveHits },
    demoMode: ctx.demoMode,
    read: billReadContext(ctx.env, ctx.clock),
    publisher: ctx.publisher,
    today: accountDate(ctx.clock.now(), ctx.accountTz),
    patch: {
      strategy: {
        ...strategy,
        targetPrice: toDecimal128(strategy.targetPrice),
        feeEstimate: toDecimal128(strategy.feeEstimate),
        ...(strategy.maxCost ? { maxCost: toDecimal128(strategy.maxCost) } : {}),
      },
      'trigger.consecutiveHits': consecutiveHits,
      displayInverted: D(targetPrice).lt('0.01'),
    },
  });
  if (triggerReady && bill.last) {
    await enqueueStrategy(ctx.env.REDIS_URL, id, `edit.${bill.last.at.getTime()}`);
  }
  return detail;
}

export async function reviewBill(id: string, ctx: BillContext): Promise<BillDetail> {
  const bill = await requireDoc(id);
  if (!bill.beneficiaryId) throw invalid('Add the vendor bank account before review');
  if (!D(moneyOf(bill.billAmount)).gt(0)) throw invalid('Enter the bill amount before review');
  if (bill.billCurrency === bill.homeCurrency) throw invalid('Choose a foreign bill currency before review');
  const mark = bill.last
    ? undefined
    : await currentPairPrice(ctx.env, { base: bill.billCurrency, quote: bill.homeCurrency });
  const userId = await demoUserId();
  return applyTransition({
    billId: id,
    event: 'REVIEW',
    clock: ctx.clock,
    actor: `user:${userId}`,
    auditType: 'STRATEGY_UPDATED',
    demoMode: ctx.demoMode,
    read: billReadContext(ctx.env, ctx.clock),
    publisher: ctx.publisher,
    today: accountDate(ctx.clock.now(), ctx.accountTz),
    ...(mark
      ? {
          patch: {
            last: { price: toDecimal128(mark.price), at: ctx.clock.now(), source: mark.source },
          },
        }
      : {}),
  });
}

export async function armBill(id: string, body: ArmBody, ctx: BillContext): Promise<BillDetail> {
  const bill = await requireDoc(id);
  if (!bill.beneficiaryId) throw invalid('Resolve a beneficiary before arming');
  if (!bill.strategy) throw invalid('Set a strategy before arming');
  if (!D(moneyOf(bill.billAmount)).gt(0)) throw invalid('Enter the bill amount before review');
  if (bill.billCurrency === bill.homeCurrency) throw invalid('Choose a foreign bill currency before review');
  const stored = bill.last
    ? {
        price: moneyOf(bill.last.price),
        at: bill.last.at,
        source: bill.last.source === 'AIRWALLEX' ? ('AIRWALLEX' as const) : ('SIMULATED' as const),
      }
    : await currentPairPrice(ctx.env, { base: bill.billCurrency, quote: bill.homeCurrency }).then((mark) => ({
        price: mark.price,
        at: ctx.clock.now(),
        source: mark.source,
      }));
  const entry = await armEntry({
    base: bill.billCurrency,
    quote: bill.homeCurrency,
    price: stored.price,
    at: stored.at,
    source: stored.source,
  });
  await assertTransferValid(ctx, bill, body);
  const leadDays = defaultLeadDays(body.transferMethod);
  const skip = await conversionSkipDates(ctx, bill.billCurrency, bill.homeCurrency);
  const schedule = executionSchedule({
    dueDate: formatUtcDate(bill.dueDate),
    leadDays,
    skip,
    cutoff: bill.strategy.autosettleCutoff,
    timeZone: ctx.accountTz,
  });
  const past = schedule.autosettleAt.getTime() <= ctx.clock.now().getTime();
  const locked = past
    ? await quoteLock(ctx.env, ctx.clock).lock({
        buy: bill.billCurrency,
        sell: bill.homeCurrency,
        buyAmount: moneyOf(bill.billAmount),
        validity: 'MIN_1',
      })
    : undefined;
  if (locked && parseInstant(locked.validToAt).getTime() <= ctx.clock.now().getTime()) {
    throw new ServiceError('QUOTE_EXPIRED', 'Quote expired before the transfer was created', 409);
  }
  const gateway = ctx.safetyNet !== undefined ? ctx.safetyNet : safetyNetGateway(ctx.env);
  let safetyNetTransferId: string | undefined;
  if (!past && gateway) {
    const beneficiary = await Beneficiary.findById(bill.beneficiaryId);
    if (!beneficiary) throw invalid('Resolve a beneficiary before arming');
    safetyNetTransferId = await gateway.schedule({
      billId: id,
      beneficiaryId: beneficiary.airwallexBeneficiaryId,
      transferCurrency: bill.billCurrency,
      transferAmount: moneyOf(bill.billAmount),
      sourceCurrency: bill.homeCurrency,
      transferMethod: body.transferMethod,
      reason: body.transferReason,
      reference: body.reference,
      transferDate: schedule.executionDeadline,
    });
  }
  const userId = await demoUserId();
  const detail = await applyTransition({
    billId: id,
    event: past ? 'ARM_PAST_DEADLINE' : 'ARM',
    clock: ctx.clock,
    actor: `user:${userId}`,
    auditType: 'ARMED',
    payload: { pastDeadline: past, executionDeadline: schedule.executionDeadline },
    demoMode: ctx.demoMode,
    read: billReadContext(ctx.env, ctx.clock),
    publisher: ctx.publisher,
    today: accountDate(ctx.clock.now(), ctx.accountTz),
    patch: {
      transferMethod: body.transferMethod,
      transferReason: body.transferReason,
      reference: body.reference,
      leadDays,
      executionDeadline: utcDateOnly(schedule.executionDeadline),
      entry: { price: toDecimal128(entry.price), at: ctx.clock.now() },
      last: { price: toDecimal128(entry.price), at: entry.at, source: entry.source },
      standingInstruction: { at: ctx.clock.now(), by: userId },
      'timers.autosettleAt': schedule.autosettleAt,
      'timers.autosettleFiredAt': past ? ctx.clock.now() : null,
      ...(safetyNetTransferId ? { safetyNet: { transferId: safetyNetTransferId } } : {}),
      'trigger.consecutiveHits': 0,
      displayInverted: D(entry.price).lt('0.01'),
    },
  });
  if (!past || !locked) return detail;
  await notePastDeadlinePayment({
    env: ctx.env,
    clock: ctx.clock,
    billId: id,
    buy: bill.billCurrency,
    sell: bill.homeCurrency,
    quote: locked,
    publisher: ctx.publisher,
  });
  return getBill(id, ctx.demoMode, accountDate(ctx.clock.now(), ctx.accountTz), billReadContext(ctx.env, ctx.clock));
}

export function pauseBill(id: string, ctx: BillContext): Promise<BillDetail> {
  return simpleTransition(id, ctx, 'PAUSE', 'PAUSED');
}

export function resumeBill(id: string, ctx: BillContext): Promise<BillDetail> {
  return simpleTransition(id, ctx, 'RESUME', 'RESUMED');
}

export function rearmBill(id: string, ctx: BillContext): Promise<BillDetail> {
  return simpleTransition(id, ctx, 'REARM', 'REARMED');
}

export async function cancelBill(id: string, ctx: BillContext): Promise<BillDetail> {
  const bill = await Bill.findById(id);
  if (bill?.state === 'IN_FLIGHT') {
    await cancelInFlightTransfer({
      env: ctx.env,
      clock: ctx.clock,
      gateway: transferGateway(ctx.env, ctx.clock),
      publisher: ctx.publisher,
      demoMode: ctx.demoMode,
      billId: id,
    });
    return getBill(id, ctx.demoMode, accountDate(ctx.clock.now(), ctx.accountTz), billReadContext(ctx.env, ctx.clock));
  }
  return simpleTransition(id, ctx, 'CANCEL', 'CANCELLED');
}

export function payNow(id: string, ctx: BillContext): Promise<BillDetail> {
  return payBillNow({
    billId: id,
    env: ctx.env,
    clock: ctx.clock,
    quotes: quoteLock(ctx.env, ctx.clock),
    balances: currentBalances(ctx.env),
    publisher: ctx.publisher,
    demoMode: ctx.demoMode,
    read: billReadContext(ctx.env, ctx.clock),
  });
}

function simpleTransition(
  id: string,
  ctx: BillContext,
  event: 'PAUSE' | 'RESUME' | 'CANCEL' | 'REARM',
  auditType: 'PAUSED' | 'RESUMED' | 'CANCELLED' | 'REARMED',
): Promise<BillDetail> {
  return applyTransition({
    billId: id,
    event,
    clock: ctx.clock,
    actor: 'user',
    auditType,
    demoMode: ctx.demoMode,
    read: billReadContext(ctx.env, ctx.clock),
    publisher: ctx.publisher,
    today: accountDate(ctx.clock.now(), ctx.accountTz),
  });
}

async function requireDoc(id: string) {
  if (!mongoose.isValidObjectId(id)) throw notFound();
  const bill = await Bill.findById(id);
  if (!bill) throw notFound();
  return bill;
}

function moneyOf(value: { toString(): string }): string {
  return decimalString(fromDecimal128(value));
}

/** Prefer a tick newer than the price stored on the draft, so entry sits on the live chart. */
async function armEntry(stored: {
  base: string;
  quote: string;
  price: string;
  at: Date;
  source: 'AIRWALLEX' | 'SIMULATED';
}): Promise<{ price: string; at: Date; source: 'AIRWALLEX' | 'SIMULATED' }> {
  const tick = await RateTick.findOne(sharedPairTicks({ base: stored.base, quote: stored.quote }))
    .sort({ ts: -1 })
    .lean();
  if (tick && tick.ts.getTime() > stored.at.getTime()) {
    return {
      price: decimalString(fromDecimal128(tick.price)),
      at: tick.ts,
      source: tick.meta.source === 'AIRWALLEX' ? 'AIRWALLEX' : 'SIMULATED',
    };
  }
  return stored;
}

function resolveTarget(body: PutStrategyBody, amount: string, fee: string): string {
  if (body.mode === 'TARGET_RATE') return required(body.targetPrice, 'Target price is required');
  try {
    return targetPriceFromMaxCost(required(body.maxCost, 'Max cost is required'), amount, fee);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw invalid(error instanceof Error ? error.message : 'Invalid max cost');
  }
}

function required(value: string | undefined, message: string): string {
  if (!value) throw invalid(message);
  return value;
}

/**
 * DEMO-ONLY: there is no login yet, so the standing instruction is attributed
 * to one demo user.
 * PROD: the authenticated user id.
 */
export async function demoUserId(): Promise<string> {
  const existing = await User.findOne({ email: DEMO_EMAIL });
  if (existing) return String(existing._id);
  const created = await User.create({ name: 'Demo', email: DEMO_EMAIL });
  return String(created._id);
}

let publisherRedis: Redis | undefined;

export function eventPublisher(url: string): EventPublisher {
  publisherRedis ??= new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  const redis = publisherRedis;
  return {
    async publish(event) {
      if (redis.status === 'wait') await redis.connect();
      await publish(redis, event);
    },
  };
}

export async function closeEventPublisher(): Promise<void> {
  const redis = publisherRedis;
  publisherRedis = undefined;
  if (redis) await redis.quit();
}

export function todayFor(env: Env, clock: Clock = new SystemClock()): string {
  return accountDate(clock.now(), env.AIRWALLEX_ACCOUNT_TZ);
}

export function billContext(env: Env, clock: Clock = new SystemClock()): BillContext {
  return {
    clock,
    accountTz: env.AIRWALLEX_ACCOUNT_TZ,
    cutoff: env.DEADLINE_AUTOSETTLE_CUTOFF,
    env,
    demoMode: env.DEMO_MODE,
    paymentsGateway: env.PAYMENTS_GATEWAY,
    pollIntervalMs: env.POLL_INTERVAL_MS,
    defaults: {
      bufferBps: env.TRIGGER_BUFFER_BPS,
      confirmTicks: env.TRIGGER_CONFIRM_TICKS,
      quoteValidityTarget: env.QUOTE_VALIDITY_TARGET,
      quoteValidityDeadline: env.QUOTE_VALIDITY_DEADLINE,
    },
    publisher: eventPublisher(env.REDIS_URL),
  };
}
