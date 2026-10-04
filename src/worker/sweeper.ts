import type { Queue } from 'bullmq';
import { Bill } from '@/server/db/models';
import type { Clock } from '@/server/adapters/clock';
import { deadlinePayload, jobIds } from '@/server/queue';
import type { AppLogger } from '@/server/logging/logger';
import { runLoop } from '@/worker/loop';

const LATE_MS = 60_000;

export async function sweepOnce(options: {
  clock: Clock;
  deadlineQueue: Queue;
  logger: AppLogger;
}): Promise<number> {
  const now = options.clock.now();
  const due = await Bill.find({
    state: { $in: ['WATCHING', 'PAUSED'] },
    'timers.autosettleAt': { $lte: now },
    $or: [
      { 'timers.autosettleFiredAt': { $exists: false } },
      { 'timers.autosettleFiredAt': null },
    ],
  })
    .select('_id timers.autosettleAt')
    .lean();

  let enqueued = 0;
  for (const bill of due) {
    const billId = String(bill._id);
    const autosettleAt = bill.timers?.autosettleAt;
    if (autosettleAt instanceof Date) {
      const lateMs = now.getTime() - autosettleAt.getTime();
      if (lateMs > LATE_MS) {
        options.logger.warn({ billId, lateMs }, 'CATCH_UP');
      }
    }
    const data = deadlinePayload.parse({ billId });
    await options.deadlineQueue.add('deadline.autosettle', data, {
      jobId: jobIds.deadlineAutosettle(billId),
    });
    enqueued += 1;
  }
  return enqueued;
}

export function startSweeper(options: {
  signal: AbortSignal;
  intervalMs: number;
  clock: Clock;
  deadlineQueue: Queue;
  logger: AppLogger;
}): void {
  runLoop(
    options.signal,
    options.intervalMs,
    () => sweepOnce(options).then(() => undefined),
    (error) => {
      options.logger.error({ err: error }, 'sweeper failed');
    },
  );
}
