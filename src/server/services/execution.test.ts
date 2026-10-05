import {
  executionSummarySchema,
  type ExecutionSummary,
} from '@/contracts/airwallex';
import { AirwallexError } from '@/server/adapters/airwallex/errors';
import { webhookSignature } from '@/server/adapters/airwallex/webhooks';
import { instant, type Clock } from '@/server/adapters/clock';
import type { TransferGateway } from '@/server/adapters/transfers';
import { toDecimal128 } from '@/server/db/decimal';
import { billDetail } from '@/server/db/repositories/bills';
import {
  Beneficiary,
  Bill,
  Execution,
  Quote,
  WebhookEvent,
} from '@/server/db/models';
import { parseEnv, type Env } from '@/server/env';
import { closeWorkQueues } from '@/server/queue/work';
import { closeBalanceCache } from '@/server/services/balanceCache';
import {
  cancelInFlightTransfer,
  RetryableExecutionError,
  runExecution,
} from '@/server/services/execution';
import { runReconcile } from '@/server/services/reconcile';
import { processWebhook, receiveWebhook } from '@/server/services/webhooks';
import { createQueue, createWorker, jobIds } from '@/server/queue';
import {
  bootDb,
  isolatedPrefix,
  shutdownDb,
  watchingBillInput,
} from '@/server/test/harness';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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
    expect(
      await Execution.countDocuments({ billId: bill._id, active: true }),
    ).toBe(0);
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
      fail: new AirwallexError({
        status: 400,
        code: 'validation_failed',
        message: 'bad reference',
      }),
    });
    await runExecution({
      ...deps,
      env: { ...deps.env, PAYMENTS_GATEWAY: 'airwallex' },
    });
    const saved = await Bill.findById(bill._id);
    expect(saved?.state).toBe('FAILED');
  });

  it('releases an expired quote from the provider and fails a second invalid quote', async () => {
    const expired = new AirwallexError({
      status: 400,
      code: 'quote_expired',
      message: 'expired',
    });
    const first = await ready('qexp', { fail: expired });
    await runExecution(first.deps);
    expect((await Bill.findById(first.bill._id))?.state).toBe('WATCHING');

    const invalid = new AirwallexError({
      status: 400,
      code: 'quote_id_invalid',
      message: 'bad quote',
    });
    const second = await ready('qbad', { fail: invalid });
    await runExecution(second.deps);
    expect((await Bill.findById(second.bill._id))?.state).toBe('WATCHING');
    await Bill.updateOne(
      { _id: second.bill._id },
      { $set: { state: 'EXECUTING' } },
    );
    await runExecution(second.deps);
    expect((await Bill.findById(second.bill._id))?.state).toBe('FAILED');
  });

  it('retries a cutoff when the balance is short', async () => {
    const { deps } = await ready('cutoff', { available: '0' });
    await expect(
      runExecution({ ...deps, mode: 'DEADLINE' }),
    ).rejects.toBeInstanceOf(RetryableExecutionError);
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
    await processWebhook({
      env,
      clock: clock(),
      eventId: 'evt-paid',
      demoMode: true,
    });
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
    await processWebhook({
      env,
      clock: clock(),
      eventId: 'evt-cancel',
      demoMode: true,
    });
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

  it('creates one transfer when two executions run together', async () => {
    const { bill, deps, gateway } = await ready('double');
    let started = 0;
    let release = () => {};
    const bothEntered = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = gateway.create.bind(gateway);
    gateway.create = async (input) => {
      started += 1;
      if (started >= 2) release();
      await Promise.race([
        bothEntered,
        new Promise((resolve) => setTimeout(resolve, 300)),
      ]);
      return original(input);
    };
    await Promise.all([runExecution(deps), runExecution(deps)]);
    expect(started).toBe(2);
    expect(await Execution.countDocuments({ billId: bill._id })).toBe(1);
    expect((await Bill.findById(bill._id))?.state).toBe('IN_FLIGHT');
    expect((await Execution.findOne({ billId: bill._id }))?.requestId).toBe(
      `tr:${String(bill._id)}:1`,
    );
  });

  it('applies a webhook that arrives before the create response', async () => {
    const env = webhookEnv();
    const { bill, deps, gateway } = await ready('racehook');
    const requestId = `tr:${String(bill._id)}:1`;
    const body = webhookBody({
      id: 'evt-race',
      name: 'payout.transfer.paid',
      requestId,
      transferId: 'trf-racehook',
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
    await expect(
      processWebhook({
        env,
        clock: clock(),
        eventId: 'evt-race',
        demoMode: true,
      }),
    ).rejects.toThrow(/before the transfer/);
    expect(
      (await WebhookEvent.findById('evt-race'))?.processedAt,
    ).toBeUndefined();

    let release = () => {};
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = gateway.create.bind(gateway);
    gateway.create = async (input) => {
      await hold;
      return original(input);
    };
    const running = runExecution(deps);
    try {
      await vi.waitFor(async () => {
        expect(await Execution.countDocuments({ billId: bill._id })).toBe(1);
      });
      await processWebhook({
        env,
        clock: clock(),
        eventId: 'evt-race',
        demoMode: true,
      });
    } finally {
      release();
    }
    await running;
    expect((await Bill.findById(bill._id))?.state).toBe('PAID');
    expect(await Execution.countDocuments({ billId: bill._id })).toBe(1);
    expect(gateway.creates).toBe(1);
  });

  it('finishes a crashed execution on the next worker', async () => {
    const env = parseEnv(process.env);
    const { bill, deps, gateway } = await ready('restart');
    let attempts = 0;
    const original = gateway.create.bind(gateway);
    gateway.create = async (input) => {
      attempts += 1;
      if (attempts === 1) {
        throw new AirwallexError({
          status: 503,
          code: 'service_unavailable',
          message: 'down',
        });
      }
      return original(input);
    };
    const prefix = isolatedPrefix('restart-exec');
    const queue = createQueue('execution', { url: env.REDIS_URL, prefix });
    const first = createWorker(
      'execution',
      async () => {
        await runExecution(deps);
      },
      { url: env.REDIS_URL, prefix },
    );
    try {
      await queue.add(
        'execution',
        { billId: String(bill._id), attempt: 1, mode: 'TARGET' },
        {
          jobId: jobIds.execute(String(bill._id), 1),
          attempts: 2,
          backoff: { type: 'fixed', delay: 1_500 },
        },
      );
      await vi.waitFor(() => expect(attempts).toBe(1));
      await first.close();
      const second = createWorker(
        'execution',
        async () => {
          await runExecution(deps);
        },
        { url: env.REDIS_URL, prefix },
      );
      try {
        await vi.waitFor(
          async () => {
            expect((await Bill.findById(bill._id))?.state).toBe('IN_FLIGHT');
          },
          { timeout: 8_000 },
        );
      } finally {
        await second.close();
      }
    } finally {
      await first.close().catch(() => undefined);
      await queue.close();
    }
    expect(await Execution.countDocuments({ billId: bill._id })).toBe(1);
    expect((await Execution.findOne({ billId: bill._id }))?.requestId).toBe(
      `tr:${String(bill._id)}:1`,
    );
    expect(gateway.creates).toBe(1);
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

function fakeGateway(
  suffix: string,
  fail?: Error,
): TransferGateway & {
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
        ...(status === 'PAID'
          ? { lateFailureWatchUntil: instant(NOW + 86_400_000).toISOString() }
          : {}),
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
