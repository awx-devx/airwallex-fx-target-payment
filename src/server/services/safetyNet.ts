import type { TransferMethod, TransferReason } from '@/contracts/airwallex';
import { createAirwallexClient } from '@/server/adapters/airwallex/client';
import { cancelTransfer, createScheduledTransfer } from '@/server/adapters/airwallex/endpoints/transfers';
import type { Env } from '@/server/env';
import { getLogger } from '@/server/logging/logger';

export interface SafetyNetSchedule {
  billId: string;
  beneficiaryId: string;
  transferCurrency: string;
  transferAmount: string;
  sourceCurrency: string;
  transferMethod: TransferMethod;
  reason: TransferReason;
  reference: string;
  transferDate: string;
}

export interface SafetyNetGateway {
  schedule(input: SafetyNetSchedule): Promise<string>;
  cancel(transferId: string): Promise<void>;
}

/** `null` when Layer B is off. The default flag is `none`. */
export function safetyNetGateway(env: Env): SafetyNetGateway | null {
  if (env.DEADLINE_SAFETY_NET !== 'airwallex') return null;
  return {
    async schedule(input) {
      const created = await createScheduledTransfer(createAirwallexClient(env), input);
      return created.transferId;
    },
    async cancel(transferId) {
      await cancelTransfer(createAirwallexClient(env), transferId);
    },
  };
}

/**
 * Cancel the scheduled transfer before another path pays. A cancel failure is
 * logged and does not stop the payment: the deadline still has to execute.
 */
export async function releaseSafetyNet(
  env: Env,
  transferId: string | undefined,
  gateway?: SafetyNetGateway | null,
): Promise<void> {
  if (!transferId) return;
  const net = gateway === undefined ? safetyNetGateway(env) : gateway;
  if (!net) return;
  try {
    await net.cancel(transferId);
  } catch (error) {
    getLogger().warn({ err: error, transferId }, 'safety net cancel failed');
  }
}
