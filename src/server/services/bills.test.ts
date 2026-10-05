import { Beneficiary, Bill, BillEvent } from '@/server/db/models';
import { toDecimal128 } from '@/server/db/decimal';
import { SystemClock } from '@/server/adapters/clock';
import { GET as listBills } from '@/app/api/bills/route';
import { POST as arm } from '@/app/api/bills/[id]/arm/route';
import { GET as balances } from '@/app/api/balances/route';
import { getEnv } from '@/server/env';
import { bootDb, shutdownDb, watchingBillInput } from '@/server/test/harness';
import { closeWorkQueues } from '@/server/queue/work';
import { armBill, billContext, cancelBill, closeEventPublisher, putStrategy } from '@/server/services/bills';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

beforeAll(async () => {
  await bootDb();
});

afterAll(async () => {
  await closeWorkQueues();
  await closeEventPublisher();
  await shutdownDb();
});

describe('bill routes', () => {
  it('sets a strategy, arms into watching, and lists the bill', async () => {
    const beneficiary = await Beneficiary.create({
      airwallexBeneficiaryId: 'ben-eur',
      name: 'Example GmbH',
      entityType: 'COMPANY',
      bankCountry: 'DE',
      accountCurrency: 'EUR',
      maskedAccount: '••••8354',
      transferMethods: ['LOCAL'],
    });
    const bill = await Bill.create({
      ...watchingBillInput('ready'),
      state: 'READY',
      beneficiaryId: beneficiary._id,
      dueDate: new Date('2026-10-05T00:00:00.000Z'),
      last: {
        price: toDecimal128('1.20'),
        at: new Date('2026-09-01T00:00:00.000Z'),
        source: 'AIRWALLEX',
      },
    });
    const ctx = billContext(getEnv(), new SystemClock(() => Date.parse('2026-09-01T00:00:00.000Z')));
    const strategy = await putStrategy(
      String(bill._id),
      { mode: 'TARGET_RATE', targetPrice: '1.10' },
      ctx,
    );
    expect(strategy.state).toBe('READY');
    expect(strategy.strategy?.targetPrice).toBe('1.1');

    const armed = await armBill(
      String(bill._id),
      {
        standingInstruction: true,
        transferMethod: 'LOCAL',
        transferReason: 'bill_payment',
        reference: 'INV-ready',
      },
      ctx,
    );
    expect(armed.state).toBe('WATCHING');
    expect(armed.entryPrice).toBe('1.2');
    expect(armed.executionDeadline).toBe('2026-10-02');
    expect(armed.allowedActions).toContain('PAUSE');
    expect(await BillEvent.countDocuments({ billId: bill._id, type: 'ARMED' })).toBe(1);

    const listed = await listBills(new Request('http://localhost/api/bills?state=WATCHING'));
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as Array<{ id: string }>;
    expect(body.some((row) => row.id === String(bill._id))).toBe(true);
  });

  it('arms straight to executing when the cutoff has passed', async () => {
    const beneficiary = await Beneficiary.create({
      airwallexBeneficiaryId: 'ben-late',
      name: 'Late GmbH',
      entityType: 'COMPANY',
      bankCountry: 'DE',
      accountCurrency: 'EUR',
      maskedAccount: '••••1111',
      transferMethods: ['LOCAL'],
    });
    const bill = await Bill.create({
      ...watchingBillInput('late'),
      state: 'READY',
      beneficiaryId: beneficiary._id,
      dueDate: new Date('2026-10-05T00:00:00.000Z'),
      strategy: {
        mode: 'MAX_COST',
        targetPrice: toDecimal128('1'),
        maxCost: toDecimal128('250000'),
        feeEstimate: toDecimal128('0'),
        bufferBps: 0,
        confirmTicks: 2,
        quoteValidityTarget: 'MIN_1',
        quoteValidityDeadline: 'MIN_1',
        autosettleCutoff: '14:00',
      },
      last: {
        price: toDecimal128('1.20'),
        at: new Date('2026-10-04T00:00:00.000Z'),
        source: 'AIRWALLEX',
      },
    });
    const late = await armBill(
      String(bill._id),
      {
        standingInstruction: true,
        transferMethod: 'LOCAL',
        transferReason: 'bill_payment',
        reference: 'INV-late',
      },
      billContext(getEnv(), new SystemClock(() => Date.parse('2026-10-06T00:00:00.000Z'))),
    );
    expect(late.state).toBe('EXECUTING');
    expect(late.executionDeadline).toBe('2026-10-02');

    const missing = await arm(
      new Request('http://localhost/api/bills/missing/arm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          standingInstruction: true,
          transferMethod: 'LOCAL',
          transferReason: 'bill_payment',
          reference: 'INV-missing',
        }),
      }),
      { params: Promise.resolve({ id: 'not-a-bill' }) },
    );
    expect(missing.status).toBe(404);
  });

  it('rejects a cancel once the bill is executing', async () => {
    const bill = await Bill.create(watchingBillInput('executing'));
    await Bill.updateOne({ _id: bill._id }, { state: 'EXECUTING' });
    await expect(cancelBill(String(bill._id), billContext(getEnv()))).rejects.toThrow(/cannot CANCEL/);
  });

  it('returns cached mock balances', async () => {
    const first = await balances();
    const second = await balances();
    expect(first.status).toBe(200);
    expect(await second.json()).toEqual(await first.clone().json());
  });
});
