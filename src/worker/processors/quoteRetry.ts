import type { Job } from 'bullmq';
import { currentBalances } from '@/server/adapters/balances';
import { SystemClock } from '@/server/adapters/clock';
import { quoteLock } from '@/server/adapters/quotes';
import { getEnv } from '@/server/env';
import { quoteRetryPayload, type QuoteRetryPayload } from '@/server/queue';
import { eventPublisher } from '@/server/services/bills';
import { runQuoteRetry } from '@/server/services/strategy';

export async function processQuoteRetry(job: Job<QuoteRetryPayload>): Promise<void> {
  const body = quoteRetryPayload.parse(job.data);
  const env = getEnv();
  const clock = new SystemClock();
  await runQuoteRetry({
    billId: body.billId,
    env,
    clock,
    quotes: quoteLock(env, clock),
    balances: currentBalances(env),
    publisher: eventPublisher(env.REDIS_URL),
    demoMode: env.DEMO_MODE,
  });
}
