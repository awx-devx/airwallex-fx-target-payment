import type { ArmBody, BillDetail, PatchBillBody, PutStrategyBody, StrategyDetail } from '@/contracts/api';
import type { BillSummary } from '@/contracts/bill';
import type { QuoteValidity } from '@/contracts/airwallex';
import { D, decimalString } from '@/contracts/money';
import { SystemClock, type Clock } from '@/server/adapters/clock';
import { publish } from '@/server/events/bus';
import type { Env } from '@/server/env';
import { Redis } from 'ioredis';
import { fromDecimal128, toDecimal128 } from '@/server/db/decimal';
import { Bill, User } from '@/server/db/models';
import { billDetail, listBills, type BillListQuery } from '@/server/db/repositories/bills';
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
import { conversionSkipDates } from '@/server/services/reference';
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
}

export function listBillSummaries(
  query: BillListQuery,
  demoMode: boolean,
  today: string,
): Promise<BillSummary[]> {
  return listBills(query, demoMode, today);
}

export async function getBill(id: string, demoMode: boolean, today: string): Promise<BillDetail> {
  if (!mongoose.isValidObjectId(id)) throw notFound();
  const detail = await billDetail(id, demoMode, today);
  if (!detail) throw notFound();
  return detail;
}

export async function patchBill(id: string, body: PatchBillBody, ctx: BillContext): Promise<BillDetail> {
  const bill = await requireDoc(id);
  if (!EDITABLE.has(bill.state)) {
    throw new ServiceError('INVALID_STATE', `${bill.state} cannot be edited`, 409);
  }
  const transferMethod = body.transferMethod ?? bill.transferMethod;
  const leadDays = body.transferMethod ? defaultLeadDays(body.transferMethod) : bill.leadDays;
  const dueDate = body.dueDate ?? formatUtcDate(bill.dueDate);
  const schedule =
    body.dueDate || body.transferMethod
      ? executionSchedule({
          dueDate,
          leadDays,
          skip: await conversionSkipDates(ctx, bill.billCurrency, bill.homeCurrency),
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
        ...(schedule
          ? {
              executionDeadline: utcDateOnly(schedule.executionDeadline),
              'timers.autosettleAt': schedule.autosettleAt,
              'timers.autosettleFiredAt': null,
            }
          : {}),
      },
      $inc: { version: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!updated) throw new ServiceError('INVALID_STATE', 'Bill changed concurrently', 409);
  return getBill(id, ctx.demoMode, accountDate(ctx.clock.now(), ctx.accountTz));
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
      rearmImproveBps: REARM_IMPROVE_BPS,
    });
    consecutiveHits = outcome.consecutiveHits;
  }
  return applyTransition({
    billId: id,
    event: 'SET_STRATEGY',
    clock: ctx.clock,
    actor: 'user',
    auditType: 'STRATEGY_UPDATED',
    payload: { mode: strategy.mode, targetPrice, consecutiveHits },
    demoMode: ctx.demoMode,
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
}

export async function armBill(id: string, body: ArmBody, ctx: BillContext): Promise<BillDetail> {
  const bill = await requireDoc(id);
  if (!bill.beneficiaryId) throw invalid('Resolve a beneficiary before arming');
  if (!bill.strategy) throw invalid('Set a strategy before arming');
  if (!bill.last) throw invalid('A rate is required to capture the entry');
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
  const userId = await demoUserId();
  return applyTransition({
    billId: id,
    event: past ? 'ARM_PAST_DEADLINE' : 'ARM',
    clock: ctx.clock,
    actor: `user:${userId}`,
    auditType: 'ARMED',
    payload: { pastDeadline: past, executionDeadline: schedule.executionDeadline },
    demoMode: ctx.demoMode,
    publisher: ctx.publisher,
    today: accountDate(ctx.clock.now(), ctx.accountTz),
    patch: {
      transferMethod: body.transferMethod,
      transferReason: body.transferReason,
      reference: body.reference,
      leadDays,
      executionDeadline: utcDateOnly(schedule.executionDeadline),
      entry: { price: bill.last.price, at: ctx.clock.now() },
      standingInstruction: { at: ctx.clock.now(), by: userId },
      'timers.autosettleAt': schedule.autosettleAt,
      'timers.autosettleFiredAt': null,
      'trigger.consecutiveHits': 0,
      displayInverted: D(moneyOf(bill.last.price)).lt('0.01'),
    },
  });
}

export function pauseBill(id: string, ctx: BillContext): Promise<BillDetail> {
  return simpleTransition(id, ctx, 'PAUSE', 'PAUSED');
}

export function resumeBill(id: string, ctx: BillContext): Promise<BillDetail> {
  return simpleTransition(id, ctx, 'RESUME', 'RESUMED');
}

export function cancelBill(id: string, ctx: BillContext): Promise<BillDetail> {
  return simpleTransition(id, ctx, 'CANCEL', 'CANCELLED');
}

function simpleTransition(
  id: string,
  ctx: BillContext,
  event: 'PAUSE' | 'RESUME' | 'CANCEL',
  auditType: 'PAUSED' | 'RESUMED' | 'CANCELLED',
): Promise<BillDetail> {
  return applyTransition({
    billId: id,
    event,
    clock: ctx.clock,
    actor: 'user',
    auditType,
    demoMode: ctx.demoMode,
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
