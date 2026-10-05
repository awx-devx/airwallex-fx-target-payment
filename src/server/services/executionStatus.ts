import {
  executionSummarySchema,
  type ExecutionSummary,
} from '@/contracts/airwallex';
import type { BillEventType } from '@/contracts/events';
import type { BillState } from '@/contracts/bill';
import { parseInstant, type Clock } from '@/server/adapters/clock';
import { toDecimal128 } from '@/server/db/decimal';
import { Bill, BillEvent, Execution } from '@/server/db/models';
import { billDetail } from '@/server/db/repositories/bills';
import { formatUtcDate } from '@/server/domain/deadline';
import { decideTransferUpdate } from '@/server/domain/transferStatus';
import { transition } from '@/server/domain/stateMachine';
import { getLogger } from '@/server/logging/logger';
import mongoose from 'mongoose';
import { notificationFor } from '@/server/services/notify';
import type { EventPublisher } from '@/server/services/transitionBill';

export async function applyTransferStatus(input: {
  summary: ExecutionSummary;
  clock: Clock;
  demoMode: boolean;
  actor: string;
  publisher?: EventPublisher;
  executionId?: string;
}): Promise<void> {
  const execution = await findExecution(input.summary, input.executionId);
  if (!execution || execution.requestId !== input.summary.requestId) return;
  const bill = await Bill.findById(execution.billId);
  if (!bill) return;
  const storedUpdatedAt = execution.awxUpdatedAt ? execution.awxUpdatedAt.getTime() : undefined;
  const decision = decideTransferUpdate({
    billState: bill.state,
    storedStatus: execution.transferStatus ?? undefined,
    ...(storedUpdatedAt !== undefined ? { storedUpdatedAt } : {}),
    incomingStatus: input.summary.status,
    incomingUpdatedAt: parseInstant(input.summary.updatedAt).getTime(),
    cancelRequested: execution.cancelRequested === true,
  });
  if (decision.kind === 'ignore' || !decision.status) return;
  const summary = executionSummarySchema.parse({
    ...input.summary,
    mode: execution.mode,
    status: decision.status,
    ...(decision.failure
      ? { failure: { message: decision.failure.message, category: decision.failure.category } }
      : {}),
  });
  const changed = execution.transferStatus !== summary.status;
  if (!decision.event) {
    await persistExecution(execution._id, summary, input.clock, decision.deactivate === true);
    if (changed) {
      await record(bill._id, input.actor, input.clock, 'TRANSFER_STATUS', { status: summary.status });
    }
    await publishExecution(input, summary, String(bill._id));
    return;
  }
  const next = transition(bill.state as BillState, decision.event);
  const at = input.clock.now();
  const audit = {
    ts: at,
    type: decision.audit ?? 'TRANSFER_STATUS',
    actor: input.actor,
    payload: { status: summary.status, transferId: summary.transferId },
  };
  const session = await mongoose.startSession();
  let committed = false;
  try {
    await session.withTransaction(async () => {
      await persistExecution(execution._id, summary, input.clock, decision.deactivate === true, session);
      const updated = await Bill.findOneAndUpdate(
        { _id: bill._id, state: { $in: next.allowedFrom }, version: bill.version },
        {
          $set: { state: next.to, activeExecutionId: execution._id },
          $inc: { version: 1 },
          $push: { recentEvents: { $each: [audit], $slice: -20 } },
        },
        { returnDocument: 'after', session },
      );
      if (!updated) throw new Error('bill changed concurrently');
      committed = true;
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'bill changed concurrently') return;
    throw error;
  } finally {
    await session.endSession();
  }
  if (!committed) return;
  await record(bill._id, input.actor, input.clock, audit.type, audit.payload, at);
  await publishBill(input, String(bill._id), at);
  await publishExecution(input, summary, String(bill._id));
  if (
    (summary.status === 'PAID' || summary.status === 'FAILED') &&
    bill.state === 'EXECUTING' &&
    next.to === 'IN_FLIGHT'
  ) {
    await applyTransferStatus(input);
  }
}

async function findExecution(summary: ExecutionSummary, executionId?: string) {
  if (executionId && mongoose.isValidObjectId(executionId)) {
    const byId = await Execution.findById(executionId);
    if (byId) return byId;
  }
  const byTransfer = await Execution.findOne({ airwallexTransferId: summary.transferId });
  if (byTransfer) return byTransfer;
  return Execution.findOne({ requestId: summary.requestId });
}

async function persistExecution(
  id: mongoose.Types.ObjectId,
  summary: ExecutionSummary,
  clock: Clock,
  deactivate: boolean,
  session?: mongoose.ClientSession,
): Promise<void> {
  await Execution.updateOne(
    { _id: id },
    {
      $set: {
        airwallexTransferId: summary.transferId,
        shortReferenceId: summary.shortReferenceId,
        transferStatus: summary.status,
        ...(summary.funding ? { fundingStatus: summary.funding.status } : {}),
        awxUpdatedAt: parseInstant(summary.updatedAt),
        statusUpdatedAt: clock.now(),
        conversionRate: toDecimal128(summary.rate),
        sourceAmount: toDecimal128(summary.sourceAmount),
        ...(summary.amountPayerPays ? { amountPayerPays: toDecimal128(summary.amountPayerPays) } : {}),
        ...(summary.amountBeneficiaryReceives
          ? { amountBeneficiaryReceives: toDecimal128(summary.amountBeneficiaryReceives) }
          : {}),
        ...(summary.fee
          ? {
              feeAmount: toDecimal128(summary.fee.amount),
              feeCurrency: summary.fee.currency,
              feePaidBy: summary.fee.paidBy,
            }
          : {}),
        ...(summary.swiftChargeOption ? { swiftChargeOption: summary.swiftChargeOption } : {}),
        ...(summary.dispatchDate ? { dispatchDate: parseInstant(`${summary.dispatchDate}T00:00:00.000Z`) } : {}),
        ...(summary.lateFailureWatchUntil
          ? { lateFailureWatchUntil: parseInstant(summary.lateFailureWatchUntil) }
          : {}),
        ...(summary.failure ? { failure: summary.failure } : {}),
        raw: { summary },
        ...(deactivate ? { active: false } : {}),
      },
    },
    session ? { session } : {},
  );
}

async function record(
  billId: mongoose.Types.ObjectId,
  actor: string,
  clock: Clock,
  type: BillEventType,
  payload: Record<string, unknown>,
  at = clock.now(),
): Promise<void> {
  try {
    await BillEvent.create({ billId, ts: at, type, actor, payload });
  } catch (error) {
    getLogger().warn({ err: error, billId: String(billId) }, 'bill event was not stored');
  }
}

async function publishBill(
  input: { clock: Clock; demoMode: boolean; publisher?: EventPublisher },
  billId: string,
  at: Date,
): Promise<void> {
  if (!input.publisher) return;
  const detail = await billDetail(billId, input.demoMode, formatUtcDate(at));
  if (!detail) return;
  try {
    await input.publisher.publish({ type: 'bill.updated', bill: detail });
  } catch (error) {
    getLogger().warn({ err: error, billId }, 'bill update was not published');
  }
  const notification = notificationFor({
    billId,
    auditType: detail.state === 'PAID' ? 'PAID' : detail.state === 'FAILED' ? 'FAILED' : 'TRANSFER_STATUS',
    at,
  });
  if (!notification || (detail.state !== 'PAID' && detail.state !== 'FAILED')) return;
  try {
    await input.publisher.publish(notification);
  } catch (error) {
    getLogger().warn({ err: error, billId }, 'notification was not published');
  }
}

async function publishExecution(
  input: { publisher?: EventPublisher },
  summary: ExecutionSummary,
  billId: string,
): Promise<void> {
  if (!input.publisher) return;
  try {
    await input.publisher.publish({ type: 'execution.updated', execution: summary, billId });
  } catch (error) {
    getLogger().warn({ err: error, billId }, 'execution update was not published');
  }
}
