import type { AirwallexClient } from '@/server/adapters/airwallex/client';
import { jsonNumber } from '@/server/adapters/airwallex/json';

export const SIMULATION_STATUSES = [
  'PROCESSING',
  'SENT',
  'PAID',
  'FAILED',
  'CANCELLED',
  'OVERDUE',
] as const;
export type SimulationStatus = (typeof SIMULATION_STATUSES)[number];

/**
 * SANDBOX: transition and deposit exist only on the sandbox API.
 * Production payments move through funding, webhooks, and the reconciler.
 * https://www.airwallex.com/docs/developer-tools/sandbox-environment/simulation
 */
export async function transitionTransfer(
  client: AirwallexClient,
  transferId: string,
  input: { nextStatus: SimulationStatus; failureType?: string },
): Promise<unknown> {
  client.assertSandbox();
  return client.request({
    method: 'POST',
    path: `/simulation/transfers/${transferId}/transition`,
    body: {
      next_status: input.nextStatus,
      ...(input.failureType ? { failure_type: input.failureType } : {}),
    },
  });
}

export async function createDeposit(
  client: AirwallexClient,
  input: { globalAccountId: string; amount: string },
): Promise<unknown> {
  client.assertSandbox();
  return client.request({
    method: 'POST',
    path: '/simulation/deposit/create',
    body: {
      global_account_id: input.globalAccountId,
      // AIRWALLEX: deposit amount is a JSON number, not a decimal string.
      // https://www.airwallex.com/docs/api/simulation/deposits/create
      amount: jsonNumber(input.amount),
    },
  });
}
