import type { Job } from 'bullmq';
import { quoteRetryPayload, type QuoteRetryPayload } from '@/server/queue';
import { UnimplementedProcessorError } from '@/worker/processors/unimplemented';

export async function processQuoteRetry(
  job: Job<QuoteRetryPayload>,
): Promise<void> {
  quoteRetryPayload.parse(job.data);
  throw new UnimplementedProcessorError('quote-retry');
}
