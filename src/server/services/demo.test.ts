import { billDetailSchema } from '@/contracts/api';
import { billSummarySchema } from '@/contracts/bill';
import { GET as listBills } from '@/app/api/bills/route';
import { GET as getBillRoute } from '@/app/api/bills/[id]/route';
import { POST as simulateRoute } from '@/app/api/demo/bills/[id]/simulate/route';
import { currentBalances } from '@/server/adapters/balances';
import { instant, SystemClock, type Clock } from '@/server/adapters/clock';
import { demoAwareClock, noteDemoClock } from '@/server/adapters/clock/demo';
import {
  clearDemoKeys,
  closeDemoStore,
  scriptedPrice,
  setShortWallet,
} from '@/server/adapters/demo/store';
import { quoteLock } from '@/server/adapters/quotes';
import {
  activeSimulatedMarket,
  createRateSource,
  routingRateSource,
} from '@/server/adapters/rates';
import { transferGateway } from '@/server/adapters/transfers';
import { toDecimal128 } from '@/server/db/decimal';
import { Beneficiary, Bill, Execution } from '@/server/db/models';
import { parseEnv } from '@/server/env';
import { closeWorkQueues } from '@/server/queue/work';
import { closeEventPublisher } from '@/server/services/bills';
import {
  advanceDemoTransfer,
  applyPendingMarket,
  enqueueMarket,
  resetDemo,
  runScenario,
  startSimulation,
} from '@/server/services/demo';
import { stepDemoSims } from '@/server/services/demoSim';
import { nextTransferAttempt, runExecution } from '@/server/services/execution';
import { seedDemo, seedGenerated } from '@/server/services/seed';
import { runStrategyJob } from '@/server/services/strategy';
import {
  bootDb,
  isolatedPrefix,
  shutdownDb,
  watchingBillInput,
} from '@/server/test/harness';
import { sweepOnce } from '@/worker/sweeper';
import { Queue } from 'bullmq';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

const NOW = Date.parse('2026-10-01T18:00:00.000Z');
let nowMs = NOW;
const clock: Clock = {
  now() {
    nowMs += 1;
    return instant(nowMs);
  },
};

describe('demo mode', () => {
  beforeAll(async () => {
    await bootDb();
  });

  afterEach(async () => {
    await clearDemoKeys(parseEnv(process.env).REDIS_URL);
    noteDemoClock(null);
    await setShortWallet(parseEnv(process.env).REDIS_URL, false);
  });

  afterAll(async () => {
    await closeWorkQueues();
    await closeEventPublisher();
    await closeDemoStore();
    await shutdownDb();
  });

  it('rejects a second simulate while one is running', async () => {
    const bill = await watching();
    const env = parseEnv(process.env);
    await startSimulation({
      env,
      clock,
      billId: String(bill._id),
      nowRealMs: 1_000,
    });
    await expect(
      startSimulation({
        env,
        clock,
        billId: String(bill._id),
        nowRealMs: 2_000,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
  });

  it('routes a scripted price and pays through the normal path', async () => {
    const env = parseEnv(process.env);
    const bill = await watching();
    const billId = String(bill._id);
    const source = routingRateSource(
      {
        async getIndicative() {
          return { price: '9', source: 'AIRWALLEX' as const };
        },
      },
      (id) => scriptedPrice(env.REDIS_URL, id),
    );
    await startSimulation({
      env,
      clock,
      billId,
      nowRealMs: 5_000,
      durationSec: 1,
      advanceEverySec: 1,
      overshootBps: 5,
    });
    const scripted = await source.getIndicative({
      buy: 'EUR',
      sell: 'USD',
      buyAmount: '250000',
      billId,
    });
    expect(scripted).toEqual({ price: '1.1', source: 'SIMULATED' });
    const publisher = { async publish() {} };
    for (let second = 0; second < 8; second += 1) {
      const steps = await stepDemoSims({
        env,
        clock,
        nowRealMs: 5_000 + second * 1_000,
        source,
        publisher,
      });
      let current = await Bill.findById(billId);
      const step = steps.find((item) => item.billId === billId);
      if (
        current?.state === 'WATCHING' &&
        step?.tickId &&
        (current.trigger?.consecutiveHits ?? 0) >= 2
      ) {
        await runStrategyJob({
          billId,
          tickId: step.tickId,
          env,
          clock,
          quotes: quoteLock(env, clock),
          balances: currentBalances(env),
          demoMode: true,
        });
        current = await Bill.findById(billId);
      }
      if (current?.state === 'EXECUTING') {
        await runExecution({
          env,
          clock,
          balances: currentBalances(env),
          gateway: transferGateway(env, clock),
          demoMode: true,
          billId,
          attempt: await nextTransferAttempt(billId),
          mode: 'TARGET',
        });
      }
      if ((await Bill.findById(billId))?.state === 'PAID') break;
    }
    expect((await Bill.findById(billId))?.state).toBe('PAID');
    const execution = await Execution.findOne({ billId });
    expect(execution?.transferStatus).toBe('PAID');
    expect(execution?.airwallexTransferId?.startsWith('mock-')).toBe(true);
  });

  it('returns contract payloads from the bill and simulate routes', async () => {
    const bill = await watching();
    const listed = await listBills(new Request('http://localhost/api/bills'));
    expect(listed.status).toBe(200);
    expect(
      z.array(billSummarySchema).safeParse(await listed.json()).success,
    ).toBe(true);
    const detail = await getBillRoute(
      new Request('http://localhost/api/bills/x'),
      {
        params: Promise.resolve({ id: String(bill._id) }),
      },
    );
    expect(billDetailSchema.safeParse(await detail.json()).success).toBe(true);
    const started = await simulateRoute(
      new Request('http://localhost/api/demo/bills/x/simulate', {
        method: 'POST',
        body: JSON.stringify({ durationSec: 1 }),
      }),
      { params: Promise.resolve({ id: String(bill._id) }) },
    );
    expect(started.status).toBe(200);
    expect(billDetailSchema.safeParse(await started.json()).success).toBe(true);
    const again = await simulateRoute(
      new Request('http://localhost/api/demo/bills/x/simulate', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: String(bill._id) }) },
    );
    expect(again.status).toBe(409);
    expect((await again.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'INVALID_STATE' },
    });
  });

  it('jumps the shared clock and the sweeper sees the cutoff', async () => {
    const env = parseEnv(process.env);
    await seedDemo({ env, clock });
    const real = 10_000;
    const warped = demoAwareClock(new SystemClock(() => real), () => real);
    await runScenario({ env, clock, nowRealMs: real, name: 'deadline-pay' });
    expect(warped.now().getTime()).toBeGreaterThan(NOW);
    const queue = new Queue('deadline', {
      connection: { url: env.REDIS_URL },
      prefix: isolatedPrefix('demo'),
    });
    const enqueued = await sweepOnce({
      clock: warped,
      deadlineQueue: queue,
      logger: { warn() {}, error() {}, info() {} } as never,
    });
    expect(enqueued).toBeGreaterThan(0);
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it('reports an empty wallet for the insufficient-balance scenario', async () => {
    const env = parseEnv(process.env);
    await runScenario({
      env,
      clock,
      nowRealMs: 1,
      name: 'insufficient-balance',
    });
    const rows = await currentBalances(env).getBalances();
    expect(rows.find((row) => row.currency === 'USD')?.available).toBe('0');
  });

  it('applies a market nudge on the simulated book', async () => {
    const env = parseEnv(process.env);
    await createRateSource(env);
    await enqueueMarket({ env, pair: 'EURUSD', nudgePips: 1 });
    await applyPendingMarket(env);
    expect(activeSimulatedMarket()?.price('EUR', 'USD')).toBe('1.0851');
  });

  it('moves a mock transfer when asked', async () => {
    const env = parseEnv(process.env);
    const bill = await watching();
    await startSimulation({
      env,
      clock,
      billId: String(bill._id),
      nowRealMs: 9_000,
      durationSec: 1,
      advanceEverySec: 1,
    });
    const source = routingRateSource(
      {
        async getIndicative() {
          return { price: '9', source: 'AIRWALLEX' as const };
        },
      },
      (id) => scriptedPrice(env.REDIS_URL, id),
    );
    for (let second = 0; second < 4; second += 1) {
      const steps = await stepDemoSims({
        env,
        clock,
        nowRealMs: 9_000 + second * 1_000,
        source,
      });
      const step = steps.find((item) => item.billId === String(bill._id));
      const current = await Bill.findById(bill._id);
      if (
        current?.state === 'WATCHING' &&
        step?.tickId &&
        (current.trigger?.consecutiveHits ?? 0) >= 2
      ) {
        await runStrategyJob({
          billId: String(bill._id),
          tickId: step.tickId,
          env,
          clock,
          quotes: quoteLock(env, clock),
          balances: currentBalances(env),
          demoMode: true,
        });
      }
      if ((await Bill.findById(bill._id))?.state === 'EXECUTING') {
        await runExecution({
          env,
          clock,
          balances: currentBalances(env),
          gateway: transferGateway(env, clock),
          demoMode: true,
          billId: String(bill._id),
          attempt: await nextTransferAttempt(String(bill._id)),
          mode: 'TARGET',
        });
        break;
      }
    }
    const execution = await Execution.findOne({
      billId: bill._id,
      active: true,
    });
    expect(execution?.airwallexTransferId).toBeTruthy();
    const advanced = await advanceDemoTransfer({
      env,
      clock,
      transferId: execution?.airwallexTransferId ?? '',
      to: 'SENT',
    });
    expect(advanced.status).toBe('SENT');
  });

  it('resets bills and keeps beneficiaries', async () => {
    const env = parseEnv(process.env);
    const beneficiary = await Beneficiary.create({
      airwallexBeneficiaryId: 'keep-me',
      name: 'Kept',
      entityType: 'COMPANY',
      bankCountry: 'DE',
      accountCurrency: 'EUR',
      maskedAccount: '••••9',
      transferMethods: ['LOCAL'],
    });
    await Bill.create(watchingBillInput('reset-me'));
    const prefix = isolatedPrefix('reset');
    await resetDemo({ env, prefix });
    expect(await Bill.countDocuments()).toBe(0);
    expect(await Beneficiary.findById(beneficiary._id)).toBeTruthy();
  });

  it('creates nothing new when the same seed runs twice', async () => {
    const env = parseEnv(process.env);
    const first = await seedGenerated({
      env,
      clock,
      profile: 'mixed',
      seed: 42,
      count: 2,
      states: ['DRAFT', 'WATCHING'],
      currencies: ['EUR', 'GBP'],
    });
    const second = await seedGenerated({
      env,
      clock,
      profile: 'mixed',
      seed: 42,
      count: 2,
      states: ['DRAFT', 'WATCHING'],
      currencies: ['EUR', 'GBP'],
    });
    expect(first.created).toBe(2);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);
    expect(await Bill.countDocuments({ seedKey: /^gen:v1:42:/ })).toBe(2);
  });

  it('reaches every bill state through the services', async () => {
    const env = parseEnv(process.env);
    const result = await seedGenerated({
      env,
      clock,
      profile: 'lifecycle',
      seed: 7,
    });
    expect(result.created).toBe(result.plan.length);
    const states = await Bill.find({ seedKey: /^gen:v1:7:/ }).distinct('state');
    expect(states.sort()).toEqual(
      [
        'CANCELLED',
        'DRAFT',
        'EXECUTING',
        'FAILED',
        'IN_FLIGHT',
        'PAID',
        'PAUSED',
        'READY',
        'WATCHING',
      ].sort(),
    );
  });
});

async function watching() {
  const suffix = crypto.randomUUID();
  const beneficiary = await Beneficiary.create({
    airwallexBeneficiaryId: `awx-${suffix}`,
    name: 'Acme GmbH',
    entityType: 'COMPANY',
    bankCountry: 'DE',
    accountCurrency: 'EUR',
    maskedAccount: '••••1',
    transferMethods: ['LOCAL'],
  });
  return Bill.create({
    ...watchingBillInput(suffix),
    beneficiaryId: beneficiary._id,
    strategy: {
      mode: 'TARGET_RATE',
      targetPrice: toDecimal128('1'),
      feeEstimate: toDecimal128('0'),
      bufferBps: 0,
      confirmTicks: 2,
      quoteValidityTarget: 'MIN_1',
      quoteValidityDeadline: 'MIN_1',
      autosettleCutoff: '14:00',
    },
    trigger: { consecutiveHits: 0 },
    last: { price: toDecimal128('1.1'), at: instant(NOW), source: 'SIMULATED' },
    timers: { autosettleAt: instant(NOW + 86_400_000) },
  });
}
