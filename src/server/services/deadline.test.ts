import { quoteSummarySchema, type QuoteSummary } from '@/contracts/airwallex';
import { AppWarpClock, instant, type Clock } from '@/server/adapters/clock';
import { toDecimal128 } from '@/server/db/decimal';
import { Beneficiary, Bill, BillEvent, Quote } from '@/server/db/models';
import { parseEnv } from '@/server/env';
import { captureLogs } from '@/server/logging/logger';
import { createQueue, jobIds } from '@/server/queue';
import { closeWorkQueues, workQueue } from '@/server/queue/work';
import { armBill, billContext, patchBill } from '@/server/services/bills';
import { runDeadlineJob } from '@/server/services/deadline';
import { bootDb, isolatedPrefix, shutdownDb, watchingBillInput } from '@/server/test/harness';
import { sweepOnce } from '@/worker/sweeper';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const START = Date.parse('2026-06-01T16:00:00.000Z');

describe('deadline autosettle', () => {
  beforeAll(async () => {
    await bootDb();
  });

  afterAll(async () => {
    await closeWorkQueues();
    await shutdownDb();
  });

  it('fires due bills in order under a 1000× warp and does not fire twice', async () => {
    let real = START;
    const clock = new AppWarpClock(() => real, instant(START));
    clock.setSpeed(1_000);
    const early = await Bill.create({
      ...watchingBillInput('warp-early'),
      timers: { autosettleAt: instant(START + 1_000) },
    });
    const later = await Bill.create({
      ...watchingBillInput('warp-later'),
      state: 'PAUSED',
      timers: { autosettleAt: instant(START + 5_000) },
    });
    const prefix = isolatedPrefix('warp');
    const queue = createQueue('deadline', { url: process.env.REDIS_URL ?? '', prefix });
    const logger = captureLogs('silent').logger;
    const sweep = () => sweepOnce({ clock, deadlineQueue: queue, logger });

    expect(await sweep()).toBe(0);

    real = START + 2;
    expect(await sweep()).toBe(1);
    expect(await queue.getJob(jobIds.deadlineAutosettle(String(early._id)))).toBeTruthy();
    expect(await queue.getJob(jobIds.deadlineAutosettle(String(later._id)))).toBeUndefined();

    const notes: string[] = [];
    await runDeadlineJob({
      ...deps(clock),
      billId: String(early._id),
      publisher: {
        async publish(event) {
          if (event.type === 'notification') notes.push(event.notification.title);
        },
      },
      quotes: { lock: async () => priced('q-early', clock.now()) },
    });
    expect((await Bill.findById(early._id).lean())?.state).toBe('EXECUTING');
    expect(notes).toEqual(['Paying at the deadline']);
    expect((await workQueue('execution', process.env.REDIS_URL ?? '').getJob(jobIds.execute(String(early._id), 1)))?.data.mode).toBe(
      'DEADLINE',
    );
    expect(await sweep()).toBe(0);

    real = START + 6;
    expect(await sweep()).toBe(1);
    await runDeadlineJob({
      ...deps(clock),
      billId: String(later._id),
      quotes: { lock: async () => priced('q-later', clock.now()) },
    });
    expect((await Bill.findById(later._id).lean())?.state).toBe('EXECUTING');
    expect(await sweep()).toBe(0);
    await queue.close();
  });

  it('stays watching when the quote cannot be locked', async () => {
    const clock: Clock = { now: () => instant(START) };
    const bill = await Bill.create({
      ...watchingBillInput('lock-fail'),
      timers: { autosettleAt: instant(START - 1_000) },
    });
    await expect(
      runDeadlineJob({
        ...deps(clock),
        billId: String(bill._id),
        quotes: {
          lock: async () => {
            throw new Error('quote unavailable');
          },
        },
      }),
    ).rejects.toThrow('quote unavailable');
    const saved = await Bill.findById(bill._id).lean();
    expect(saved?.state).toBe('WATCHING');
    expect(saved?.timers?.autosettleFiredAt ?? null).toBeNull();
  });

  it('clears a fired cutoff only when the edited deadline moves into the future', async () => {
    const env = parseEnv(process.env);
    const clock: Clock = { now: () => instant(START) };
    const fired = instant(Date.parse('2026-01-01T00:00:00.000Z'));
    const bill = await Bill.create({
      ...watchingBillInput('retime'),
      state: 'READY',
      timers: { autosettleAt: fired, autosettleFiredAt: fired },
    });
    await patchBill(String(bill._id), { dueDate: '2026-12-01' }, billContext(env, clock));
    expect((await Bill.findById(bill._id).lean())?.timers?.autosettleFiredAt ?? null).toBeNull();

    await Bill.updateOne({ _id: bill._id }, { $set: { 'timers.autosettleFiredAt': fired } });
    await patchBill(String(bill._id), { dueDate: '2026-06-02' }, billContext(env, clock));
    expect((await Bill.findById(bill._id).lean())?.timers?.autosettleFiredAt?.getTime()).toBe(fired.getTime());
  });

  it('stores the safety-net transfer and cancels it when the cutoff pays', async () => {
    const env = parseEnv(process.env);
    const clock: Clock = { now: () => instant(START) };
    const cancelled: string[] = [];
    const gateway = {
      async schedule() {
        return 'net-1';
      },
      async cancel(id: string) {
        cancelled.push(id);
      },
    };
    const beneficiary = await Beneficiary.create({
      airwallexBeneficiaryId: 'ben-net',
      name: 'Net GmbH',
      entityType: 'COMPANY',
      bankCountry: 'DE',
      accountCurrency: 'EUR',
      maskedAccount: '••••2222',
      transferMethods: ['LOCAL'],
    });
    const bill = await Bill.create({
      ...watchingBillInput('safety'),
      state: 'READY',
      beneficiaryId: beneficiary._id,
      dueDate: new Date('2026-12-01T00:00:00.000Z'),
      strategy: {
        mode: 'TARGET_RATE',
        targetPrice: toDecimal128('1.2'),
        feeEstimate: toDecimal128('0'),
        bufferBps: 0,
        confirmTicks: 2,
        quoteValidityTarget: 'MIN_1',
        quoteValidityDeadline: 'MIN_1',
        autosettleCutoff: '14:00',
      },
      last: { price: toDecimal128('1.2'), at: instant(START), source: 'SIMULATED' },
    });
    const armed = await armBill(
      String(bill._id),
      {
        standingInstruction: true,
        transferMethod: 'LOCAL',
        transferReason: 'bill_payment',
        reference: 'INV-safety',
      },
      { ...billContext(env, clock), safetyNet: gateway },
    );
    expect(armed.safetyNetTransferId).toBe('net-1');
    expect(armed.state).toBe('WATCHING');

    await Bill.updateOne({ _id: bill._id }, { $set: { 'timers.autosettleAt': instant(START - 1_000) } });
    await runDeadlineJob({
      ...deps(clock),
      billId: String(bill._id),
      safetyNet: gateway,
      quotes: { lock: async () => priced('q-net', clock.now()) },
    });
    expect(cancelled).toEqual(['net-1']);
    expect((await Bill.findById(bill._id).lean())?.state).toBe('EXECUTING');
    expect(await BillEvent.countDocuments({ billId: bill._id, type: 'AUTOSETTLE' })).toBe(1);
    expect(await Quote.countDocuments({ airwallexQuoteId: 'q-net' })).toBe(1);
  });

  function deps(clock: Clock) {
    return {
      env: parseEnv(process.env),
      clock,
      demoMode: true,
      quotes: { lock: async () => priced('q-default', clock.now()) },
    };
  }
});

function priced(id: string, now: Date): QuoteSummary {
  return quoteSummarySchema.parse({
    airwallexQuoteId: id,
    price: '1.2',
    sellAmount: '300000',
    buyAmount: '250000',
    clientRate: '1.2',
    clientRateOriented: '1.2',
    validity: 'MIN_1',
    validFromAt: now.toISOString(),
    validToAt: instant(now.getTime() + 60_000).toISOString(),
    usage: 'SINGLE_USE',
    conversionDate: '2026-06-01',
  });
}
