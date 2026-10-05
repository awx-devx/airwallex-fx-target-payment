import type { Job } from 'bullmq';
import { currentBalances } from '@/server/adapters/balances';
import { SystemClock } from '@/server/adapters/clock';
import { quoteLock } from '@/server/adapters/quotes';
import { getEnv } from '@/server/env';
import { strategyPayload, type StrategyPayload } from '@/server/queue';
import { eventPublisher } from '@/server/services/bills';
import { runStrategyJob } from '@/server/services/strategy';

export async function processStrategy(job: Job<StrategyPayload>): Promise<void> {
  const body = strategyPayload.parse(job.data);
  const env = getEnv();
  const clock = new SystemClock();
  await runStrategyJob({
    billId: body.billId,
    tickId: body.tickId,
    env,
    clock,
    quotes: quoteLock(env, clock),
    balances: currentBalances(env),
    publisher: eventPublisher(env.REDIS_URL),
    demoMode: env.DEMO_MODE,
  });
}
