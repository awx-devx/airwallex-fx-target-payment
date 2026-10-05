import type { Job } from 'bullmq';
import { SystemClock } from '@/server/adapters/clock';
import { transferGateway } from '@/server/adapters/transfers';
import { getEnv } from '@/server/env';
import { reconcilePayload, type ReconcilePayload } from '@/server/queue';
import { eventPublisher } from '@/server/services/bills';
import { runReconcile } from '@/server/services/reconcile';

export async function processReconcile(job: Job<ReconcilePayload>): Promise<void> {
  reconcilePayload.parse(job.data);
  const env = getEnv();
  const clock = new SystemClock();
  await runReconcile({
    env,
    clock,
    gateway: transferGateway(env, clock),
    publisher: eventPublisher(env.REDIS_URL),
    demoMode: env.DEMO_MODE,
  });
}
