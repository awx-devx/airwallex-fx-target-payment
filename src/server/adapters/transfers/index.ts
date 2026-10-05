import {
  executionSummarySchema,
  type ExecutionSummary,
} from '@/contracts/airwallex';
import { createAirwallexClient } from '@/server/adapters/airwallex/client';
import {
  transitionTransfer,
  type SimulationStatus,
} from '@/server/adapters/airwallex/endpoints/simulation';
import {
  cancelTransfer,
  createTransfer,
  getTransfer,
  listTransfers,
  validateTransfer,
  type CreateTransferInput,
} from '@/server/adapters/airwallex/endpoints/transfers';
import { isRecord } from '@/server/adapters/airwallex/values';
import { mapTransfer } from '@/server/adapters/airwallex/mappers';
import { transferRequestId } from '@/server/adapters/airwallex/requestIds';
import type { Clock } from '@/server/adapters/clock';
import type { Env } from '@/server/env';

export interface TransferCreate extends CreateTransferInput {
  sourceAmount: string;
  rate: string;
}

export interface TransferGateway {
  create(input: TransferCreate): Promise<ExecutionSummary>;
  get(
    transferId: string,
    mode: ExecutionSummary['mode'],
  ): Promise<ExecutionSummary>;
  findByRequestId(
    requestId: string,
    mode: ExecutionSummary['mode'],
  ): Promise<ExecutionSummary | null>;
  cancel(
    transferId: string,
    mode: ExecutionSummary['mode'],
  ): Promise<ExecutionSummary | null>;
  validate(
    input: Omit<CreateTransferInput, 'attempt' | 'quoteId' | 'mode'>,
  ): Promise<void>;
  transitionTo?(
    transferId: string,
    status: SimulationStatus,
    mode: ExecutionSummary['mode'],
  ): Promise<ExecutionSummary>;
}

const remembered = new Map<string, ExecutionSummary>();

export function transferGateway(env: Env, clock: Clock): TransferGateway {
  if (env.PAYMENTS_GATEWAY === 'mock') return mockTransfers(clock);
  if (!env.AIRWALLEX_CLIENT_ID || !env.AIRWALLEX_API_KEY) return unconfigured();
  return airwallexTransfers(env);
}

function airwallexTransfers(env: Env): TransferGateway {
  const client = createAirwallexClient(env);
  return {
    create: (input) => createTransfer(client, input),
    get: (transferId, mode) => getTransfer(client, transferId, mode),
    async findByRequestId(requestId, mode) {
      const payload = await listTransfers(client, { requestId });
      if (
        !isRecord(payload) ||
        !Array.isArray(payload.items) ||
        payload.items.length === 0
      ) {
        return null;
      }
      return mapTransfer(payload.items[0], mode);
    },
    async cancel(transferId, mode) {
      const payload = await cancelTransfer(client, transferId);
      if (!isRecord(payload) || typeof payload.id !== 'string') return null;
      return mapTransfer(payload, mode);
    },
    validate: (input) => validateTransfer(client, input),
    async transitionTo(transferId, status, mode) {
      // SANDBOX: move a sandbox transfer, then read it back.
      // Production payments move through funding, webhooks, and the reconciler.
      await transitionTransfer(client, transferId, {
        nextStatus: status,
        ...(status === 'FAILED' ? { failureType: 'SYSTEM_ERROR' } : {}),
      });
      return getTransfer(client, transferId, mode);
    },
  };
}

function mockTransfers(clock: Clock): TransferGateway {
  return {
    async create(input) {
      const requestId = transferRequestId(input.billId, input.attempt);
      const existing = remembered.get(requestId);
      if (existing) return { ...existing, mode: input.mode };
      // DEMO-ONLY: a local transfer stands in for POST /transfers/create.
      // PROD: PAYMENTS_GATEWAY=airwallex.
      const summary = executionSummarySchema.parse({
        transferId: `mock-${requestId}`,
        shortReferenceId: 'P-MOCK',
        requestId,
        status: 'PROCESSING',
        transferMethod: input.transferMethod,
        rate: input.rate,
        sourceAmount: input.sourceAmount,
        sourceCurrency: input.sourceCurrency,
        transferAmount: input.transferAmount,
        transferCurrency: input.transferCurrency,
        amountsTentative: false,
        updatedAt: clock.now().toISOString(),
        mode: input.mode,
      });
      remembered.set(requestId, summary);
      return summary;
    },
    async get(transferId, mode) {
      const summary = [...remembered.values()].find(
        (item) => item.transferId === transferId,
      );
      if (!summary) throw new Error(`Unknown transfer ${transferId}`);
      return { ...summary, mode };
    },
    async findByRequestId(requestId, mode) {
      const summary = remembered.get(requestId);
      return summary ? { ...summary, mode } : null;
    },
    async cancel(transferId, mode) {
      for (const [requestId, summary] of remembered) {
        if (summary.transferId !== transferId) continue;
        const cancelled = executionSummarySchema.parse({
          ...summary,
          status: 'CANCELLED',
          mode,
          updatedAt: clock.now().toISOString(),
        });
        remembered.set(requestId, cancelled);
        return cancelled;
      }
      return null;
    },
    async validate() {},
    async transitionTo(transferId, status, mode) {
      for (const [requestId, summary] of remembered) {
        if (summary.transferId !== transferId) continue;
        // DEMO-ONLY: the mock transfer map moves status without the sandbox simulation endpoint.
        // PROD: PAYMENTS_GATEWAY=airwallex uses the sandbox transition, then webhooks.
        const advanced = executionSummarySchema.parse({
          ...summary,
          status,
          mode,
          updatedAt: new Date(clock.now().getTime() + 1).toISOString(),
          ...(status === 'FAILED'
            ? { failure: { category: 'SYSTEM', message: 'Simulated failure' } }
            : { failure: undefined }),
        });
        remembered.set(requestId, advanced);
        return advanced;
      }
      throw new Error(`Unknown transfer ${transferId}`);
    },
  };
}

function unconfigured(): TransferGateway {
  const fail = (): Promise<never> =>
    Promise.reject(new Error('Airwallex credentials are not set'));
  return {
    create: fail,
    get: fail,
    findByRequestId: async () => null,
    cancel: fail,
    validate: fail,
  };
}
