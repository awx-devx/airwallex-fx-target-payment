import { executionSummarySchema, type ExecutionSummary } from '@/contracts/airwallex';
import { AirwallexError } from '@/server/adapters/airwallex/errors';
import { webhookSignature } from '@/server/adapters/airwallex/webhooks';
import { instant, type Clock } from '@/server/adapters/clock';
import type { TransferGateway } from '@/server/adapters/transfers';
import { toDecimal128 } from '@/server/db/decimal';
import { billDetail } from '@/server/db/repositories/bills';
import { Beneficiary, Bill, Execution, Quote, WebhookEvent } from '@/server/db/models';
import { parseEnv, type Env } from '@/server/env';
import { closeWorkQueues } from '@/server/queue/work';
import { closeBalanceCache } from '@/server/services/balanceCache';
import { cancelInFlightTransfer, RetryableExecutionError, runExecution } from '@/server/services/execution';
import { runReconcile } from '@/server/services/reconcile';
import { processWebhook, receiveWebhook } from '@/server/services/webhooks';
import { bootDb, shutdownDb, watchingBillInput } from '@/server/test/harness';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const NOW = Date.parse('2026-06-01T16:00:00.000Z');

describe('execution', () => {
  beforeAll(async () => {
    await bootDb();
  });

  afterAll(async () => {
    await closeWorkQueues();
    await closeBalanceCache();
    await shutdownDb();
  });

  it('creates one transfer and moves the bill in flight', async () => {
    const { bill, deps, gateway } = await ready('create');
    await runExecution(deps);
    await runExecution(deps);
    const saved = await Bill.findById(bill._id);
    const execution = await Execution.findOne({ billId: bill._id });
    expect(saved?.state).toBe('IN_FLIGHT');
    expect(execution?.active).toBe(true);
    expect(execution?.airwallexTransferId).toBe('trf-create');
    expect(gateway.creates).toBe(1);
    const detail = await billDetail(String(bill._id), true, '2026-06-01');
    expect(detail?.execution?.transferId).toBe('trf-create');
    expect(detail?.execution?.status).toBe('PROCESSING');
  });

  it('returns to watching when the quote is already expired', async () => {
    const { bill, deps, gateway } = await ready('expired', { expired: true });
    await runExecution(deps);
    const saved = await Bill.findById(bill._id);
    expect(saved?.state).toBe('WATCHING');
    expect(gateway.creates).toBe(0);
    expect(await Execution.countDocuments({ billId: bill._id, active: true })).toBe(0);
  });

  it('returns to watching when the balance is short', async () => {
    const { bill, deps } = await ready('short', { available: '0' });
    await runExecution(deps);
    const saved = await Bill.findById(bill._id);
    expect(saved?.state).toBe('WATCHING');
    expect(saved?.insufficientBalance).toBe(true);
  });

  it('fails the bill when the transfer is rejected', async () => {
    const { bill, deps } = await ready('reject', {
      fail: new AirwallexError({ status: 400, code: 'validation_failed', message: 'bad reference' }),
    });
    await runExecution({ ...deps, env: { ...deps.env, PAYMENTS_GATEWAY: 'airwallex' } });
    const saved = await Bill.findById(bill._id);
    expect(saved?.state).toBe('FAILED');
  });

  it('releases an expired quote from the provider and fails a second invalid quote', async () => {
    const expired = new AirwallexError({ status: 400, code: 'quote_expired', message: 'expired' });
    const first = await ready('qexp', { fail: expired });
    await runExecution(first.deps);
    expect((await Bill.findById(first.bill._id))?.state).toBe('WATCHING');

    const invalid = new AirwallexError({ status: 400, code: 'quote_id_invalid', message: 'bad quote' });
    const second = await ready('qbad', { fail: invalid });
    await runExecution(second.deps);
    expect((await Bill.findById(second.bill._id))?.state).toBe('WATCHING');
    await Bill.updateOne({ _id: second.bill._id }, { $set: { state: 'EXECUTING' } });
    await runExecution(second.deps);
    expect((await Bill.findById(second.bill._id))?.state).toBe('FAILED');
  });

  it('retries a cutoff when the balance is short', async () => {
    const { deps } = await ready('cutoff', { available: '0' });
    await expect(runExecution({ ...deps, mode: 'DEADLINE' })).rejects.toBeInstanceOf(RetryableExecutionError);
    expect((await Bill.findById(deps.billId))?.state).toBe('EXECUTING');
  });

  it('cancels an in-flight transfer before it is sent', async () => {
    const { bill, deps, gateway } = await ready('cancel');
    await runExecution(deps);
    await cancelInFlightTransfer({ ...deps, billId: String(bill._id) });
    expect((await Bill.findById(bill._id))?.state).toBe('CANCELLED');
    expect(gateway.cancels).toBe(1);
  });

  it('accepts a webhook once and applies a later paid status', async () => {
    const env = webhookEnv();
    const { bill, deps } = await ready('hook');
    await runExecution(deps);
    const execution = await Execution.findOne({ billId: bill._id });
    const body = webhookBody({
      id: 'evt-paid',
      name: 'payout.transfer.paid',
      requestId: execution?.requestId ?? '',
      transferId: 'trf-hook',
      status: 'PAID',
      updatedAt: '2026-06-01T18:00:00+0000',
    });
    const timestamp = String(NOW);
    await receiveWebhook({
      env,
      clock: clock(),
      rawBody: body,
      signature: webhookSignature('whsec', timestamp, body),
      timestamp,
    });
    await receiveWebhook({
      env,
      clock: clock(),
      rawBody: body,
      signature: webhookSignature('whsec', timestamp, body),
      timestamp,
    });
    expect(await WebhookEvent.countDocuments({ _id: 'evt-paid' })).toBe(1);
    await processWebhook({ env, clock: clock(), eventId: 'evt-paid', demoMode: true });
    expect((await Bill.findById(bill._id))?.state).toBe('PAID');

    const cancelBody = webhookBody({
      id: 'evt-cancel',
      name: 'payout.transfer.cancelled',
      requestId: execution?.requestId ?? '',
      transferId: 'trf-hook',
      status: 'CANCELLED',
      updatedAt: '2026-06-01T19:00:00+0000',
    });
    await receiveWebhook({
      env,
      clock: clock(),
      rawBody: cancelBody,
      signature: webhookSignature('whsec', timestamp, cancelBody),
      timestamp,
    });
    await processWebhook({ env, clock: clock(), eventId: 'evt-cancel', demoMode: true });
    expect((await Bill.findById(bill._id))?.state).toBe('PAID');
  });

  it('rejects a bad webhook signature', async () => {
    await expect(
      receiveWebhook({
        env: webhookEnv(),
        clock: clock(),
        rawBody: '{}',
        signature: 'nope',
        timestamp: String(NOW),
      }),
    ).rejects.toThrow(/signature/);
  });

  it('reconciles an open transfer to paid', async () => {
    const { bill, deps, gateway } = await ready('recon');
    await runExecution(deps);
    gateway.advance('PAID');
    await runReconcile({
      env: deps.env,
      clock: clock(),
      gateway,
      demoMode: true,
    });
    expect((await Bill.findById(bill._id))?.state).toBe('PAID');
  });
});

function clock(): Clock {
  return { now: () => instant(NOW) };
}

function webhookEnv(): Env {
  return { ...parseEnv(process.env), AIRWALLEX_WEBHOOK_SECRET: 'whsec' };
}

async function ready(
  suffix: string,
  options?: { expired?: boolean; available?: string; fail?: Error },
) {
  const beneficiary = await Beneficiary.create({
    airwallexBeneficiaryId: `awx-${suffix}`,
    name: 'Acme GmbH',
    entityType: 'COMPANY',
    bankCountry: 'DE',
    accountCurrency: 'EUR',
    maskedAccount: '••••1',
    transferMethods: ['LOCAL'],
  });
  const bill = await Bill.create({
    ...watchingBillInput(suffix),
    state: 'EXECUTING',
    beneficiaryId: beneficiary._id,
  });
  await Quote.create({
    billId: bill._id,
    airwallexQuoteId: `quote-${suffix}`,
    purpose: 'TARGET',
    validity: 'MIN_1',
    usage: 'SINGLE_USE',
    currencyPair: 'EURUSD',
    conversionDate: instant(NOW),
    price: toDecimal128('1.25'),
    clientRate: toDecimal128('1.25'),
    buyAmount: toDecimal128('10.00'),
    sellAmount: toDecimal128('12.50'),
    validFromAt: instant(NOW - 1_000),
    validToAt: instant(options?.expired ? NOW - 1 : NOW + 60_000),
    raw: {},
  });
  const gateway = fakeGateway(suffix, options?.fail);
  const env = parseEnv(process.env);
  const deps = {
    env,
    clock: clock(),
    balances: {
      async getBalances() {
        return [
          {
            currency: 'USD',
            available: options?.available ?? '1000.00',
            pending: '0',
            reserved: '0',
            total: options?.available ?? '1000.00',
          },
        ];
      },
    },
    gateway,
    demoMode: true,
    billId: String(bill._id),
    attempt: 1,
    mode: 'TARGET' as const,
  };
  return { bill, deps, gateway };
}

function fakeGateway(suffix: string, fail?: Error): TransferGateway & {
  creates: number;
  cancels: number;
  advance: (status: ExecutionSummary['status']) => void;
} {
  let summary: ExecutionSummary | undefined;
  let creates = 0;
  let cancels = 0;
  const gateway: TransferGateway & {
    creates: number;
    cancels: number;
    advance: (status: ExecutionSummary['status']) => void;
  } = {
    get creates() {
      return creates;
    },
    get cancels() {
      return cancels;
    },
    advance(status) {
      if (!summary) return;
      summary = executionSummarySchema.parse({
        ...summary,
        status,
        updatedAt: instant(NOW + 3_600_000).toISOString(),
        ...(status === 'PAID' ? { lateFailureWatchUntil: instant(NOW + 86_400_000).toISOString() } : {}),
      });
    },
    async create(input) {
      if (fail) throw fail;
      creates += 1;
      if (summary) return summary;
      summary = executionSummarySchema.parse({
        transferId: `trf-${suffix}`,
        shortReferenceId: 'P-1',
        requestId: `tr:${input.billId}:${input.attempt}`,
        status: 'PROCESSING',
        transferMethod: input.transferMethod,
        rate: input.rate,
        sourceAmount: input.sourceAmount,
        sourceCurrency: input.sourceCurrency,
        transferAmount: input.transferAmount,
        transferCurrency: input.transferCurrency,
        amountsTentative: false,
        updatedAt: instant(NOW).toISOString(),
        mode: input.mode,
      });
      return summary;
    },
    async get(_id, mode) {
      if (!summary) throw new Error('missing');
      return { ...summary, mode };
    },
    async findByRequestId() {
      return summary ?? null;
    },
    async cancel() {
      cancels += 1;
      if (!summary) return null;
      summary = executionSummarySchema.parse({
        ...summary,
        status: 'CANCELLED',
        updatedAt: instant(NOW + 1_000).toISOString(),
      });
      return summary;
    },
    async validate() {
      if (fail) throw fail;
    },
  };
  return gateway;
}

function webhookBody(input: {
  id: string;
  name: string;
  requestId: string;
  transferId: string;
  status: string;
  updatedAt: string;
}): string {
  return JSON.stringify({
    id: input.id,
    name: input.name,
    account_id: 'acct',
    created_at: '2026-06-01T16:00:00+0000',
    version: '2026-08-21',
    data: {
      object: {
        id: input.transferId,
        short_reference_id: 'P-1',
        request_id: input.requestId,
        status: input.status,
        transfer_method: 'LOCAL',
        source_amount: '12.50',
        source_currency: 'USD',
        transfer_amount: '10.00',
        transfer_currency: 'EUR',
        conversion: { rate: '1.25', currency_pair: 'EURUSD' },
        updated_at: input.updatedAt,
      },
    },
  });
}
