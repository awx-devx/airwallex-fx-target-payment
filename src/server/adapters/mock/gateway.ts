import {
  executionSummarySchema,
  quoteSummarySchema,
  type ExecutionSummary,
  type QuoteSummary,
} from '@/contracts/airwallex';
import { D, decimalString } from '@/contracts/money';
import type Decimal from 'decimal.js';
import type { Clock } from '@/server/adapters/clock';
import type {
  CreateTransferInput,
  PaymentsGateway,
  QuoteProvider,
  RateSource,
  RateTick,
  TransferRef,
} from '@/server/adapters/ports';
import { transferRequestId } from '@/server/adapters/airwallex/requestIds';

export type MockMethod =
  | 'getIndicative'
  | 'lock'
  | 'createTransfer'
  | 'cancelTransfer'
  | 'getTransfer'
  | 'getBalances'
  | 'upsertBeneficiary';

export interface MockFailure {
  method: MockMethod;
  times: number;
  error: Error;
}

const DEFAULT_LATENCY_MS: Record<MockMethod, number> = {
  getIndicative: 40,
  lock: 120,
  createTransfer: 200,
  cancelTransfer: 80,
  getTransfer: 60,
  getBalances: 40,
  upsertBeneficiary: 150,
};

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class Faults {
  constructor(
    private readonly failures: MockFailure[],
    private readonly latency: Partial<Record<MockMethod, number>>,
    private readonly sleep: (ms: number) => Promise<void>,
  ) {}

  async before(method: MockMethod): Promise<void> {
    const wait = this.latency[method] ?? DEFAULT_LATENCY_MS[method];
    if (wait > 0) await this.sleep(wait);
    const fault = this.failures.find(
      (item) => item.method === method && item.times > 0,
    );
    if (!fault) return;
    fault.times -= 1;
    throw fault.error;
  }
}

export class MockRateSource implements RateSource {
  private readonly faults: Faults;

  constructor(
    private readonly options: {
      clock: Clock;
      price?: string;
      failures?: MockFailure[];
      latencyMs?: Partial<Record<MockMethod, number>>;
      sleep?: (ms: number) => Promise<void>;
    },
  ) {
    this.faults = new Faults(
      options.failures ?? [],
      options.latencyMs ?? {},
      options.sleep ?? sleepMs,
    );
  }

  async getIndicative(): Promise<RateTick> {
    await this.faults.before('getIndicative');
    return {
      price: D(this.options.price ?? '1.2500'),
      ts: this.options.clock.now(),
      source: 'SIMULATED',
    };
  }
}

export class MockQuoteProvider implements QuoteProvider {
  private readonly faults: Faults;

  constructor(
    private readonly options: {
      clock: Clock;
      price?: string;
      failures?: MockFailure[];
      latencyMs?: Partial<Record<MockMethod, number>>;
      sleep?: (ms: number) => Promise<void>;
    },
  ) {
    this.faults = new Faults(
      options.failures ?? [],
      options.latencyMs ?? {},
      options.sleep ?? sleepMs,
    );
  }

  async lock(input: {
    buy: string;
    sell: string;
    buyAmount: Decimal;
    validity: QuoteSummary['validity'];
  }): Promise<QuoteSummary> {
    await this.faults.before('lock');
    const price = D(this.options.price ?? '1.2500');
    const now = this.options.clock.now();
    return quoteSummarySchema.parse({
      airwallexQuoteId: `quote-${input.buy}-${input.sell}`,
      price: decimalString(price),
      sellAmount: decimalString(price.mul(input.buyAmount)),
      buyAmount: decimalString(input.buyAmount),
      clientRate: decimalString(price),
      clientRateOriented: decimalString(price),
      validity: input.validity,
      validFromAt: now.toISOString(),
      validToAt: new Date(now.getTime() + 60_000).toISOString(),
      usage: 'SINGLE_USE',
      conversionDate: '2026-01-02',
    });
  }
}

export class MockPaymentsGateway implements PaymentsGateway {
  private readonly faults: Faults;
  private readonly byRequest = new Map<
    string,
    { transferId: string; summary: ExecutionSummary }
  >();
  private readonly byId = new Map<string, ExecutionSummary>();
  private sequence = 0;

  constructor(
    private readonly options: {
      clock: Clock;
      failures?: MockFailure[];
      latencyMs?: Partial<Record<MockMethod, number>>;
      sleep?: (ms: number) => Promise<void>;
      balances?: Array<{
        currency: string;
        available: string;
        pending: string;
        reserved: string;
        total: string;
      }>;
    },
  ) {
    this.faults = new Faults(
      options.failures ?? [],
      options.latencyMs ?? {},
      options.sleep ?? sleepMs,
    );
  }

  async createTransfer(input: CreateTransferInput): Promise<TransferRef> {
    await this.faults.before('createTransfer');
    const requestId = transferRequestId(input.billId, input.attempt);
    const existing = this.byRequest.get(requestId);
    if (existing) return { transferId: existing.transferId, requestId };
    this.sequence += 1;
    const transferId = `trf-${this.sequence}`;
    const summary = executionSummarySchema.parse({
      transferId,
      shortReferenceId: `P260101-${this.sequence}`,
      requestId,
      status: 'PROCESSING',
      transferMethod: input.transferMethod,
      rate: input.rate,
      sourceAmount: input.sourceAmount,
      sourceCurrency: input.sourceCurrency,
      transferAmount: input.transferAmount,
      transferCurrency: input.transferCurrency,
      amountsTentative: false,
      updatedAt: this.options.clock.now().toISOString(),
      mode: input.mode,
    });
    this.byRequest.set(requestId, { transferId, summary });
    this.byId.set(transferId, summary);
    return { transferId, requestId };
  }

  async cancelTransfer(id: string): Promise<void> {
    await this.faults.before('cancelTransfer');
    const summary = this.byId.get(id);
    if (!summary) throw new Error(`Unknown transfer ${id}`);
    const cancelled = executionSummarySchema.parse({
      ...summary,
      status: 'CANCELLED',
    });
    this.byId.set(id, cancelled);
  }

  async getTransfer(id: string) {
    await this.faults.before('getTransfer');
    const summary = this.byId.get(id);
    if (!summary) throw new Error(`Unknown transfer ${id}`);
    return summary;
  }

  async getBalances() {
    await this.faults.before('getBalances');
    return (
      this.options.balances ?? [
        {
          currency: 'USD',
          available: '1000.00',
          pending: '0.00',
          reserved: '0.00',
          total: '1000.00',
        },
      ]
    );
  }

  async upsertBeneficiary(input: {
    billId: string;
    name: string;
  }): Promise<{ id: string }> {
    await this.faults.before('upsertBeneficiary');
    return { id: `ben-${input.billId}` };
  }
}
