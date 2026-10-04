import type { BillEventType } from '@/contracts/events';
import type { AppEvent } from '@/contracts/sse';
import type { Clock } from '@/server/adapters/clock';
import { Bill, BillEvent } from '@/server/db/models';
import { billDetail } from '@/server/db/repositories/bills';
import { transition, type TransitionEvent } from '@/server/domain/stateMachine';
import { getLogger } from '@/server/logging/logger';
import mongoose from 'mongoose';
import { ServiceError, notFound } from '@/server/services/errors';

export interface EventPublisher {
  publish(event: AppEvent): Promise<void>;
}

export async function applyTransition(input: {
  billId: string;
  event: TransitionEvent;
  clock: Clock;
  actor: string;
  auditType: BillEventType;
  payload?: Record<string, unknown>;
  patch?: Record<string, unknown>;
  demoMode: boolean;
  publisher?: EventPublisher;
}): Promise<NonNullable<Awaited<ReturnType<typeof billDetail>>>> {
  if (!mongoose.isValidObjectId(input.billId)) throw notFound();
  const current = await Bill.findById(input.billId);
  if (!current) throw notFound();
  const next = transition(current.state, input.event);
  const at = input.clock.now();
  const audit = {
    ts: at,
    type: input.auditType,
    actor: input.actor,
    ...(input.payload ? { payload: input.payload } : {}),
  };
  const updated = await Bill.findOneAndUpdate(
    { _id: current._id, state: { $in: next.allowedFrom }, version: current.version },
    {
      $set: { state: next.to, ...(input.patch ?? {}) },
      $inc: { version: 1 },
      $push: { recentEvents: { $each: [audit], $slice: -20 } },
    },
    { returnDocument: 'after' },
  );
  if (!updated) throw new ServiceError('INVALID_STATE', 'Bill changed concurrently', 409);
  try {
    await BillEvent.create({ billId: current._id, ...audit });
  } catch (error) {
    getLogger().warn({ err: error, billId: input.billId }, 'bill event was not stored');
  }
  const detail = await billDetail(input.billId, input.demoMode);
  if (!detail) throw notFound();
  if (input.publisher) {
    try {
      await input.publisher.publish({ type: 'bill.updated', bill: detail });
    } catch (error) {
      getLogger().warn({ err: error, billId: input.billId }, 'bill update was not published');
    }
  }
  return detail;
}
