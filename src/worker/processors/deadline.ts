import type { Job } from 'bullmq';
import { SystemClock } from '@/server/adapters/clock';
import { quoteLock } from '@/server/adapters/quotes';
import { getEnv } from '@/server/env';
import { deadlinePayload, type DeadlinePayload } from '@/server/queue';
import { eventPublisher } from '@/server/services/bills';
import { runDeadlineJob } from '@/server/services/deadline';

export async function processDeadline(job: Job<DeadlinePayload>): Promise<void> {
  const body = deadlinePayload.parse(job.data);
  const env = getEnv();
  const clock = new SystemClock();
  await runDeadlineJob({
    billId: body.billId,
    env,
    clock,
    quotes: quoteLock(env, clock),
    publisher: eventPublisher(env.REDIS_URL),
    demoMode: env.DEMO_MODE,
  });
}
