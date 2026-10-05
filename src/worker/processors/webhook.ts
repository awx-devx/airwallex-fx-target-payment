import type { Job } from 'bullmq';
import { SystemClock } from '@/server/adapters/clock';
import { getEnv } from '@/server/env';
import { webhookPayload, type WebhookPayload } from '@/server/queue';
import { eventPublisher } from '@/server/services/bills';
import { processWebhook as handleWebhook } from '@/server/services/webhooks';

export async function processWebhook(job: Job<WebhookPayload>): Promise<void> {
  const body = webhookPayload.parse(job.data);
  const env = getEnv();
  await handleWebhook({
    env,
    clock: new SystemClock(),
    eventId: body.eventId,
    publisher: eventPublisher(env.REDIS_URL),
    demoMode: env.DEMO_MODE,
  });
}
