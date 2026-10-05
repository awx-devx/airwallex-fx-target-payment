import { decimalString, significantPrice } from '@/contracts/money';
import type { BillDetail } from '@/contracts/api';
import { instant, type Clock } from '@/server/adapters/clock';
import {
  noteDemoClock,
  type DemoClockState,
} from '@/server/adapters/clock/demo';
import {
  clearDemoKeys,
  createSim,
  deleteSim,
  drainMarket,
  pushMarket,
  readClock,
  readSim,
  setShortWallet,
  writeClock,
  type MarketCommand,
} from '@/server/adapters/demo/store';
import { activeSimulatedMarket } from '@/server/adapters/rates';
import type { SimulationStatus } from '@/server/adapters/airwallex/endpoints/simulation';
import { transferGateway } from '@/server/adapters/transfers';
import { fromDecimal128 } from '@/server/db/decimal';
import {
  Bill,
  BillDocument,
  BillEvent,
  Execution,
  Quote,
  RateCandle,
  RateTick,
  WebhookEvent,
} from '@/server/db/models';
import type { Env } from '@/server/env';
import { QUEUE_NAMES, createQueue } from '@/server/queue';
import {
  billReadContext,
  eventPublisher,
  getBill,
} from '@/server/services/bills';
import {
  nextTransferStatus,
  publishSim,
  writeSimEvent,
} from '@/server/services/demoSim';
import { applyTransferStatus } from '@/server/services/executionStatus';
import { ServiceError, invalid, notFound } from '@/server/services/errors';
import { accountDate } from '@/server/domain/deadline';
import Decimal from 'decimal.js';

export interface SimulateInput {
  env: Env;
  clock: Clock;
  billId: string;
  nowRealMs: number;
  durationSec?: number;
  overshootBps?: number;
  advanceEverySec?: number;
}

function assertDemo(env: Env): void {
  if (!env.DEMO_MODE) throw notFound('Demo mode is off');
}

function assertSimulate(env: Env): void {
  assertDemo(env);
  if (env.AIRWALLEX_ENV !== 'sandbox' && env.PAYMENTS_GATEWAY !== 'mock') {
    throw notFound('Simulate is only available in the sandbox');
  }
}

export async function setDemoClock(input: {
  env: Env;
  readRealMs: () => number;
  speed?: number;
  jumpTo?: string;
}): Promise<{ speed: number; now: string }> {
  assertDemo(input.env);
  if (
    input.speed !== undefined &&
    (!(input.speed > 0) || input.speed > 10_000)
  ) {
    throw invalid('Speed must be between 1 and 10000');
  }
  const real = input.readRealMs();
  const current = (await readClock(input.env.REDIS_URL)) ?? {
    speed: 1,
    realOrigin: real,
    warpedOrigin: real,
  };
  let next: DemoClockState = current;
  if (input.speed !== undefined) {
    const warped =
      current.warpedOrigin + (real - current.realOrigin) * current.speed;
    next = { speed: input.speed, realOrigin: real, warpedOrigin: warped };
  }
  if (input.jumpTo !== undefined) {
    const jumped = Date.parse(input.jumpTo);
    if (Number.isNaN(jumped)) throw invalid('jumpTo must be a date');
    next = {
      speed: next.speed,
      realOrigin: input.readRealMs(),
      warpedOrigin: jumped,
    };
  }
  await writeClock(input.env.REDIS_URL, next);
  const now = instant(
    next.warpedOrigin + (input.readRealMs() - next.realOrigin) * next.speed,
  );
  await eventPublisher(input.env.REDIS_URL).publish({
    type: 'clock',
    now: now.toISOString(),
    warp: { speed: next.speed },
  });
  return { speed: next.speed, now: now.toISOString() };
}

export async function enqueueMarket(input: {
  env: Env;
  pair: string;
  nudgePips?: number;
  rampTo?: string;
  seconds?: number;
  vol?: number;
  drift?: number;
}): Promise<{ base: string; quote: string }> {
  assertDemo(input.env);
  const pair = splitPair(input.pair);
  const commands: MarketCommand[] = [];
  if (input.nudgePips !== undefined) {
    commands.push({ op: 'nudge', ...pair, pips: input.nudgePips });
  }
  if (input.rampTo !== undefined) {
    commands.push({
      op: 'ramp',
      ...pair,
      price: input.rampTo,
      seconds: input.seconds ?? 10,
    });
  }
  if (input.vol !== undefined || input.drift !== undefined) {
    commands.push({
      op: 'params',
      ...pair,
      ...(input.vol !== undefined
        ? { vol: decimalString(new Decimal(input.vol)) }
        : {}),
      ...(input.drift !== undefined
        ? { drift: decimalString(new Decimal(input.drift)) }
        : {}),
    });
  }
  if (commands.length === 0)
    throw invalid('Provide a nudge, a ramp, or market parameters');
  for (const command of commands)
    await pushMarket(input.env.REDIS_URL, command);
  return pair;
}

/** Apply queued market commands to the worker's simulated market. */
export async function applyPendingMarket(env: Env): Promise<void> {
  const commands = await drainMarket(env.REDIS_URL);
  if (commands.length === 0) return;
  const market = activeSimulatedMarket();
  if (!market) return;
  for (const command of commands) {
    if (command.op === 'reset') {
      market.reset();
      continue;
    }
    try {
      if (command.op === 'nudge')
        market.nudge(command.base, command.quote, command.pips);
      if (command.op === 'ramp')
        market.rampTo(
          command.base,
          command.quote,
          command.price,
          command.seconds,
        );
      if (command.op === 'params') {
        market.setParams(command.base, command.quote, {
          ...(command.vol !== undefined ? { vol: command.vol } : {}),
          ...(command.drift !== undefined ? { drift: command.drift } : {}),
        });
      }
    } catch {
      // A pair the simulated book does not track is ignored.
    }
  }
}

export async function startSimulation(
  input: SimulateInput,
): Promise<BillDetail> {
  assertSimulate(input.env);
  const durationSec = input.durationSec ?? 12;
  const overshootBps = input.overshootBps ?? 5;
  const advanceEverySec = input.advanceEverySec ?? 3;
  if (!(durationSec > 0) || !(advanceEverySec > 0) || overshootBps < 0) {
    throw invalid('Simulation timing must be positive');
  }
  const bill = await Bill.findById(input.billId);
  if (!bill) throw notFound();
  if (bill.state !== 'WATCHING') {
    throw new ServiceError(
      'INVALID_STATE',
      'Simulate is only available while the bill is watching',
      409,
    );
  }
  if (!bill.strategy || !bill.last)
    throw invalid('Set a strategy and wait for a rate before simulating');
  if (await readSim(input.env.REDIS_URL, input.billId)) {
    throw new ServiceError(
      'INVALID_STATE',
      'A simulation is already running for this bill',
      409,
    );
  }
  const from = decimalString(fromDecimal128(bill.last.price));
  const target = decimalString(fromDecimal128(bill.strategy.targetPrice));
  const to = significantPrice(
    new Decimal(target).mul(
      new Decimal(1).minus(new Decimal(overshootBps).div(10000)),
    ),
  );
  const simId = `sim-${input.billId}-${input.nowRealMs}`;
  const created = await createSim(input.env.REDIS_URL, {
    simId,
    billId: input.billId,
    startedRealMs: input.nowRealMs,
    startedClockMs: input.clock.now().getTime(),
    durationSec,
    overshootBps,
    advanceEverySec,
    from,
    to,
    price: from,
    phase: 'RAMPING',
    lastTickSec: -1,
    lastAdvanceRealMs: null,
  });
  if (!created) {
    throw new ServiceError(
      'INVALID_STATE',
      'A simulation is already running for this bill',
      409,
    );
  }
  await Bill.updateOne(
    { _id: bill._id, state: 'WATCHING' },
    {
      $set: { insufficientBalance: false, 'trigger.consecutiveHits': 0 },
      $unset: { 'timers.cooldownUntil': 1, 'timers.nearMissPrice': 1 },
    },
  );
  const publisher = eventPublisher(input.env.REDIS_URL);
  await writeSimEvent({
    billId: input.billId,
    clock: input.clock,
    type: 'SIM_STARTED',
    payload: { simId, durationSec, overshootBps },
  });
  await publishSim(publisher, {
    billId: input.billId,
    simId,
    phase: 'RAMPING',
    etaSec: durationSec,
  });
  return requireBill(input.env, input.clock, input.billId);
}

export async function stopSimulation(input: {
  env: Env;
  clock: Clock;
  billId: string;
}): Promise<BillDetail> {
  assertSimulate(input.env);
  const existing = await readSim(input.env.REDIS_URL, input.billId);
  if (existing) {
    await deleteSim(input.env.REDIS_URL, input.billId);
    await writeSimEvent({
      billId: input.billId,
      clock: input.clock,
      type: 'SIM_ENDED',
      payload: { simId: existing.simId, aborted: true },
    });
    await publishSim(eventPublisher(input.env.REDIS_URL), {
      billId: input.billId,
      simId: existing.simId,
      phase: 'ABORTED',
    });
  }
  return requireBill(input.env, input.clock, input.billId);
}

export async function advanceDemoTransfer(input: {
  env: Env;
  clock: Clock;
  transferId: string;
  to?: SimulationStatus;
}): Promise<{ transferId: string; status: string }> {
  assertSimulate(input.env);
  const execution = await Execution.findOne({
    airwallexTransferId: input.transferId,
  });
  if (!execution) throw notFound('Transfer not found');
  const status = input.to ?? nextTransferStatus(execution.transferStatus ?? '');
  if (!status) throw invalid('This transfer cannot be advanced');
  const gateway = transferGateway(input.env, input.clock);
  if (!gateway.transitionTo)
    throw invalid('This gateway cannot advance transfers');
  const summary = await gateway.transitionTo(
    input.transferId,
    status,
    execution.mode,
  );
  await applyTransferStatus({
    summary,
    clock: input.clock,
    demoMode: input.env.DEMO_MODE,
    actor: 'user',
    publisher: eventPublisher(input.env.REDIS_URL),
    executionId: String(execution._id),
  });
  return { transferId: summary.transferId, status: summary.status };
}

export async function runScenario(input: {
  env: Env;
  clock: Clock;
  nowRealMs: number;
  name:
    'target-hit' | 'stay-watching' | 'deadline-pay' | 'insufficient-balance';
}): Promise<{ name: string; billId?: string }> {
  assertDemo(input.env);
  if (input.name === 'target-hit') {
    const bill = await requireSeed('demo:1');
    await startSimulation({
      env: input.env,
      clock: input.clock,
      billId: String(bill._id),
      nowRealMs: input.nowRealMs,
    });
    return { name: input.name, billId: String(bill._id) };
  }
  if (input.name === 'stay-watching') {
    const bill = await requireSeed('demo:2');
    await deleteSim(input.env.REDIS_URL, String(bill._id));
    return { name: input.name, billId: String(bill._id) };
  }
  if (input.name === 'deadline-pay') {
    const bill = await requireSeed('demo:3');
    const when = bill.timers?.autosettleAt;
    if (!(when instanceof Date)) throw invalid('Demo bill 3 has no cutoff');
    await setDemoClock({
      env: input.env,
      readRealMs: () => input.nowRealMs,
      jumpTo: when.toISOString(),
    });
    return { name: input.name, billId: String(bill._id) };
  }
  await setShortWallet(input.env.REDIS_URL, true);
  const bill = await Bill.findOne({ seedKey: 'demo:2' });
  if (bill) {
    await Bill.updateOne(
      { _id: bill._id },
      { $set: { insufficientBalance: true } },
    );
  }
  return { name: input.name, billId: bill ? String(bill._id) : undefined };
}

export async function resetDemo(input: {
  env: Env;
  prefix?: string;
}): Promise<{ ok: true }> {
  assertDemo(input.env);
  await Bill.deleteMany({});
  await BillDocument.deleteMany({});
  await BillEvent.deleteMany({});
  await Quote.deleteMany({});
  await Execution.deleteMany({});
  await WebhookEvent.deleteMany({});
  await RateTick.deleteMany({});
  await RateCandle.deleteMany({});
  const prefix = input.prefix ?? 'bull';
  for (const name of QUEUE_NAMES) {
    const queue = createQueue(name, { url: input.env.REDIS_URL, prefix });
    await queue.obliterate({ force: true });
    await queue.close();
  }
  await clearDemoKeys(input.env.REDIS_URL);
  await pushMarket(input.env.REDIS_URL, { op: 'reset' });
  noteDemoClock(null);
  return { ok: true };
}

async function requireSeed(seedKey: string) {
  const bill = await Bill.findOne({ seedKey });
  if (!bill)
    throw notFound(`Seed ${seedKey} is not loaded. Run pnpm seed:demo.`);
  return bill;
}

function requireBill(
  env: Env,
  clock: Clock,
  billId: string,
): Promise<BillDetail> {
  return getBill(
    billId,
    env.DEMO_MODE,
    accountDate(clock.now(), env.AIRWALLEX_ACCOUNT_TZ),
    billReadContext(env, clock),
  );
}

function splitPair(pair: string): { base: string; quote: string } {
  const cleaned = pair.replace('/', '').toUpperCase();
  if (cleaned.length !== 6)
    throw invalid('Pair must be six letters, such as EURUSD');
  return { base: cleaned.slice(0, 3), quote: cleaned.slice(3) };
}
