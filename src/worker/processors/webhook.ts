import type { Job } from 'bullmq';
import { webhookPayload, type WebhookPayload } from '@/server/queue';
import { UnimplementedProcessorError } from '@/worker/processors/unimplemented';

export async function processWebhook(job: Job<WebhookPayload>): Promise<void> {
  webhookPayload.parse(job.data);
  throw new UnimplementedProcessorError('webhook');
}
