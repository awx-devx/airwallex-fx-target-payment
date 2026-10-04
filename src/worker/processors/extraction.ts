import type { Job } from 'bullmq';
import { extractionPayload, type ExtractionPayload } from '@/server/queue';
import { UnimplementedProcessorError } from '@/worker/processors/unimplemented';

export async function processExtraction(
  job: Job<ExtractionPayload>,
): Promise<void> {
  extractionPayload.parse(job.data);
  throw new UnimplementedProcessorError('extraction');
}
