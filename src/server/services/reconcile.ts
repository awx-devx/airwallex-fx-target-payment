import type { Clock } from '@/server/adapters/clock';
import type { TransferGateway } from '@/server/adapters/transfers';
import { Execution } from '@/server/db/models';
import type { Env } from '@/server/env';
import { getLogger } from '@/server/logging/logger';
import { applyTransferStatus } from '@/server/services/executionStatus';
import type { EventPublisher } from '@/server/services/transitionBill';

const OPEN_STATUSES = [
  'IN_APPROVAL',
  'APPROVAL_RECALLED',
  'APPROVAL_REJECTED',
  'APPROVAL_BLOCKED',
  'SCHEDULED',
  'OVERDUE',
  'PROCESSING',
  'SENT',
] as const;

/** Poll transfers that are still open, including paid ones inside the 72h grace window. */
export async function runReconcile(input: {
  env: Env;
  clock: Clock;
  gateway: TransferGateway;
  publisher?: EventPublisher;
  demoMode: boolean;
}): Promise<void> {
  const now = input.clock.now();
  const executions = await Execution.find({
    $or: [
      { active: true, airwallexTransferId: { $exists: false } },
      { active: true, transferStatus: { $in: OPEN_STATUSES } },
      { transferStatus: 'PAID', lateFailureWatchUntil: { $gt: now } },
    ],
  });
  for (const execution of executions) {
    try {
      const summary = execution.airwallexTransferId
        ? await input.gateway.get(execution.airwallexTransferId, execution.mode)
        : await input.gateway.findByRequestId(execution.requestId, execution.mode);
      if (!summary) continue;
      await applyTransferStatus({
        summary,
        clock: input.clock,
        demoMode: input.demoMode,
        actor: 'airwallex',
        publisher: input.publisher,
        executionId: String(execution._id),
      });
    } catch (error) {
      getLogger().warn({ err: error, executionId: String(execution._id) }, 'reconcile transfer failed');
    }
  }
}
