import type { BillEventType } from '@/contracts/events';
import mongoose from 'mongoose';
import { Bill, Execution, type ExecutionMode } from '@/server/db/models';
import {
  claimExecutionCreate,
  InvalidStateError,
} from '@/server/domain/stateMachine';

export type ExecutionCreateEvent = {
  ts: Date;
  type: BillEventType;
  actor: string;
  payload?: Record<string, unknown>;
};

export type CreateExecutionInput = {
  billId: string;
  expectedVersion: number;
  mode: ExecutionMode;
  attempt: number;
  requestId: string;
  event?: ExecutionCreateEvent;
};

/**
 * The one multi-document transaction: an active execution together with the
 * bill moving to EXECUTING. Any other state change is a single-document update.
 */
export async function createExecution(
  input: CreateExecutionInput,
): Promise<{ executionId: string; version: number }> {
  if (!mongoose.isValidObjectId(input.billId)) {
    throw new InvalidStateError('bill not found');
  }

  const session = await mongoose.startSession();
  try {
    let result: { executionId: string; version: number } | undefined;
    await session.withTransaction(async () => {
      const bill = await Bill.findById(input.billId).session(session);
      if (!bill) throw new InvalidStateError('bill not found');
      const claim = claimExecutionCreate(bill.state);
      if (bill.version !== input.expectedVersion) {
        throw new InvalidStateError('bill changed concurrently');
      }

      const [execution] = await Execution.create(
        [
          {
            billId: bill._id,
            mode: input.mode,
            attempt: input.attempt,
            requestId: input.requestId,
            active: true,
          },
        ],
        { session },
      );

      const updated = await Bill.findOneAndUpdate(
        {
          _id: bill._id,
          state: { $in: claim.allowedFrom },
          version: input.expectedVersion,
        },
        {
          $set: { state: claim.to, activeExecutionId: execution._id },
          $inc: { version: 1 },
          ...(input.event
            ? { $push: { recentEvents: { $each: [input.event], $slice: -20 } } }
            : {}),
        },
        { returnDocument: 'after', session },
      );
      if (!updated) throw new InvalidStateError('bill changed concurrently');
      result = { executionId: String(execution._id), version: updated.version };
    });
    if (!result) throw new InvalidStateError('execution was not created');
    return result;
  } finally {
    await session.endSession();
  }
}
