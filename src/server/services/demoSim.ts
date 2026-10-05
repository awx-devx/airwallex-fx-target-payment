import { decimalString, significantPrice } from '@/contracts/money';
import type { SimPhase } from '@/contracts/sse';
import type { Clock } from '@/server/adapters/clock';
import {
  deleteSim,
  listSims,
  writeSim,
  type SimRecord,
} from '@/server/adapters/demo/store';
import type { RateSource } from '@/server/adapters/rates';
import type { SimulationStatus } from '@/server/adapters/airwallex/endpoints/simulation';
import { transferGateway } from '@/server/adapters/transfers';
import { fromDecimal128, toDecimal128 } from '@/server/db/decimal';
import { Bill, BillEvent, Execution, RateTick } from '@/server/db/models';
import type { Env } from '@/server/env';
import { getLogger } from '@/server/logging/logger';
import { applyTransferStatus } from '@/server/services/executionStatus';
import { considerTick } from '@/server/services/strategy';
import type { EventPublisher } from '@/server/services/transitionBill';
import Decimal from 'decimal.js';

export interface SimStep {
  billId: string;
  tickId?: string;
  phase: SimPhase;
  state: string;
}

const ADVANCE_ORDER = ['PROCESSING', 'SENT', 'PAID'] as const;

export function nextTransferStatus(status: string): SimulationStatus | null {
  if (
    status === 'SCHEDULED' ||
    status === 'OVERDUE' ||
    status === 'IN_APPROVAL'
  )
    return 'PROCESSING';
  const index = ADVANCE_ORDER.indexOf(status as (typeof ADVANCE_ORDER)[number]);
  if (index < 0 || index >= ADVANCE_ORDER.length - 1) return null;
  return ADVANCE_ORDER[index + 1] ?? null;
}

export async function publishSim(
  publisher: EventPublisher | undefined,
  event: { billId: string; simId: string; phase: SimPhase; etaSec?: number },
): Promise<void> {
  await publisher?.publish({ type: 'demo.sim', ...event });
}

export async function writeSimEvent(input: {
  billId: string;
  clock: Clock;
  type: 'SIM_STARTED' | 'SIM_ENDED';
  payload: Record<string, unknown>;
}): Promise<void> {
  const audit = {
    ts: input.clock.now(),
    type: input.type,
    actor: 'user',
    payload: input.payload,
  };
  const updated = await Bill.updateOne(
    { _id: input.billId },
    { $push: { recentEvents: { $each: [audit], $slice: -20 } } },
  );
  if (updated.matchedCount === 0) return;
  await BillEvent.create({ billId: input.billId, ...audit });
}

/** One wall-clock pass over every running Simulate. Ticks go through the normal trigger. */
export async function stepDemoSims(input: {
  env: Env;
  clock: Clock;
  nowRealMs: number;
  source: RateSource;
  publisher?: EventPublisher;
}): Promise<SimStep[]> {
  const records = await listSims(input.env.REDIS_URL);
  const steps: SimStep[] = [];
  for (const record of records) {
    try {
      steps.push(await stepOne(input, record));
    } catch (error) {
      getLogger().warn(
        { err: error, billId: record.billId },
        'demo sim step failed',
      );
      await finish(input, record, true);
      steps.push({ billId: record.billId, phase: 'ABORTED', state: 'ABORTED' });
    }
  }
  return steps;
}

async function stepOne(
  input: {
    env: Env;
    clock: Clock;
    nowRealMs: number;
    source: RateSource;
    publisher?: EventPublisher;
  },
  record: SimRecord,
): Promise<SimStep> {
  const bill = await Bill.findById(record.billId);
  if (!bill) {
    await finish(input, record, true);
    return { billId: record.billId, phase: 'ABORTED', state: 'MISSING' };
  }
  if (bill.state === 'PAID') {
    await finish(input, record, false);
    return { billId: record.billId, phase: 'DONE', state: 'PAID' };
  }
  if (bill.state === 'FAILED' || bill.state === 'CANCELLED') {
    await finish(input, record, true);
    return { billId: record.billId, phase: 'ABORTED', state: bill.state };
  }
  if (shouldAbort(bill, record)) {
    await finish(input, record, true);
    return { billId: record.billId, phase: 'ABORTED', state: bill.state };
  }

  const elapsed = (input.nowRealMs - record.startedRealMs) / 1000;
  record.price = priceAt(record, elapsed);
  await writeSim(input.env.REDIS_URL, record);
  const second = Math.floor(elapsed);
  let tickId: string | undefined;
  if (
    second > record.lastTickSec &&
    (bill.state === 'WATCHING' || bill.state === 'PAUSED')
  ) {
    const rate = await input.source.getIndicative({
      buy: bill.billCurrency,
      sell: bill.homeCurrency,
      buyAmount: decimalString(fromDecimal128(bill.billAmount)),
      billId: record.billId,
    });
    const at = input.clock.now();
    const tick = await RateTick.create({
      ts: at,
      meta: {
        base: bill.billCurrency,
        quote: bill.homeCurrency,
        billId: bill._id,
        source: 'SIMULATED',
        simId: record.simId,
      },
      price: toDecimal128(rate.price),
    });
    tickId = String(tick._id);
    record.price = rate.price;
    record.lastTickSec = second;
    await Bill.updateOne(
      { _id: bill._id },
      {
        $set: {
          last: { price: toDecimal128(rate.price), at, source: 'SIMULATED' },
        },
      },
    );
    await input.publisher?.publish({
      type: 'tick',
      pair: { base: bill.billCurrency, quote: bill.homeCurrency },
      billId: record.billId,
      ts: at.toISOString(),
      price: rate.price,
      source: 'SIMULATED',
    });
    if (bill.state === 'WATCHING') {
      await considerTick({
        env: input.env,
        clock: input.clock,
        billId: record.billId,
        tick: { id: tickId, price: rate.price, at, source: 'SIMULATED' },
      });
    }
  }

  const current = await Bill.findById(record.billId);
  const state = current?.state ?? bill.state;
  const hits = current?.trigger?.consecutiveHits ?? 0;
  const confirm = current?.strategy?.confirmTicks ?? 2;
  const phase = phaseFor(state, hits, confirm);
  if (phase !== record.phase) {
    record.phase = phase;
    await publishSim(input.publisher, {
      billId: record.billId,
      simId: record.simId,
      phase,
      etaSec: Math.max(0, Math.ceil(record.durationSec - elapsed)),
    });
  }
  await writeSim(input.env.REDIS_URL, record);
  if (state === 'IN_FLIGHT' || state === 'EXECUTING') {
    await advanceIfDue(input, record);
  }
  const after = await Bill.findById(record.billId);
  if (after?.state === 'PAID') {
    await finish(input, record, false);
    return { billId: record.billId, tickId, phase: 'DONE', state: 'PAID' };
  }
  if (after && shouldAbort(after, record)) {
    await finish(input, record, true);
    return {
      billId: record.billId,
      tickId,
      phase: 'ABORTED',
      state: after.state,
    };
  }
  return {
    billId: record.billId,
    tickId,
    phase: record.phase,
    state: after?.state ?? state,
  };
}

async function advanceIfDue(
  input: {
    env: Env;
    clock: Clock;
    nowRealMs: number;
    publisher?: EventPublisher;
  },
  record: SimRecord,
): Promise<void> {
  const execution = await Execution.findOne({
    billId: record.billId,
    active: true,
  });
  if (!execution?.airwallexTransferId || !execution.transferStatus) return;
  if (record.lastAdvanceRealMs === null) {
    record.lastAdvanceRealMs = input.nowRealMs;
    record.phase = 'SETTLING';
    await writeSim(input.env.REDIS_URL, record);
    return;
  }
  if (
    input.nowRealMs - record.lastAdvanceRealMs <
    record.advanceEverySec * 1000
  )
    return;
  const next = nextTransferStatus(execution.transferStatus);
  if (!next) return;
  const gateway = transferGateway(input.env, input.clock);
  if (!gateway.transitionTo) return;
  const summary = await gateway.transitionTo(
    execution.airwallexTransferId,
    next,
    execution.mode,
  );
  await applyTransferStatus({
    summary,
    clock: input.clock,
    demoMode: input.env.DEMO_MODE,
    actor: 'system',
    publisher: input.publisher,
    executionId: String(execution._id),
  });
  record.lastAdvanceRealMs = input.nowRealMs;
  record.phase = next === 'PAID' ? 'DONE' : 'SETTLING';
  await writeSim(input.env.REDIS_URL, record);
}

function shouldAbort(
  bill: {
    state: string;
    insufficientBalance?: boolean;
    recentEvents?: { ts: Date; type: string }[];
  },
  record: SimRecord,
): boolean {
  if (bill.insufficientBalance && record.phase !== 'RAMPING') return true;
  const last = bill.recentEvents?.at(-1);
  if (!last) return false;
  if (last.type !== 'NEAR_MISS' && last.type !== 'QUOTE_EXPIRED') return false;
  return last.ts.getTime() >= record.startedClockMs;
}

function phaseFor(state: string, hits: number, confirm: number): SimPhase {
  if (state === 'EXECUTING') return 'EXECUTING';
  if (state === 'IN_FLIGHT') return 'SETTLING';
  if (state === 'PAID') return 'DONE';
  if (hits >= confirm) return 'TRIGGERED';
  return 'RAMPING';
}

function priceAt(record: SimRecord, elapsedSec: number): string {
  if (elapsedSec <= 0) return record.from;
  if (elapsedSec >= record.durationSec) return record.to;
  const t = new Decimal(elapsedSec).div(record.durationSec);
  const eased = easeInOutCubic(t);
  const from = new Decimal(record.from);
  const to = new Decimal(record.to);
  const amp = new Decimal(1).minus(t).mul('0.00002');
  const noisy = from
    .plus(to.minus(from).mul(eased))
    .plus(noise(record.simId, Math.floor(elapsedSec), amp));
  return significantPrice(noisy.gt('0.00000001') ? noisy : to);
}

function easeInOutCubic(t: Decimal): Decimal {
  if (t.lte(0)) return new Decimal(0);
  if (t.gte(1)) return new Decimal(1);
  if (t.lte('0.5')) return t.pow(3).mul(4);
  const u = t.mul(-2).plus(2);
  return new Decimal(1).minus(u.pow(3).div(2));
}

function noise(simId: string, second: number, amplitude: Decimal): Decimal {
  let hash = 0;
  for (const char of `${simId}:${second}`)
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  const unit = (hash % 2000) / 1000 - 1;
  return amplitude.mul(unit.toFixed(6));
}

async function finish(
  input: { env: Env; clock: Clock; publisher?: EventPublisher },
  record: SimRecord,
  aborted: boolean,
): Promise<void> {
  await deleteSim(input.env.REDIS_URL, record.billId);
  const phase: SimPhase = aborted ? 'ABORTED' : 'DONE';
  await writeSimEvent({
    billId: record.billId,
    clock: input.clock,
    type: 'SIM_ENDED',
    payload: { simId: record.simId, aborted },
  });
  await publishSim(input.publisher, {
    billId: record.billId,
    simId: record.simId,
    phase,
  });
}
