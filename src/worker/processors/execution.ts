import type { Job } from 'bullmq';
import { currentBalances } from '@/server/adapters/balances';
import { SystemClock } from '@/server/adapters/clock';
import { transferGateway } from '@/server/adapters/transfers';
import { getEnv } from '@/server/env';
import { executionPayload, type ExecutionPayload } from '@/server/queue';
import { eventPublisher } from '@/server/services/bills';
import { runExecution } from '@/server/services/execution';

export async function processExecution(job: Job<ExecutionPayload>): Promise<void> {
  const body = executionPayload.parse(job.data);
  const env = getEnv();
  const clock = new SystemClock();
  await runExecution({
    billId: body.billId,
    attempt: body.attempt,
    mode: body.mode,
    env,
    clock,
    balances: currentBalances(env),
    gateway: transferGateway(env, clock),
    publisher: eventPublisher(env.REDIS_URL),
    demoMode: env.DEMO_MODE,
  });
}
