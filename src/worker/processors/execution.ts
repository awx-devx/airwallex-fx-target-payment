import type { Job } from 'bullmq';
import { executionPayload, type ExecutionPayload } from '@/server/queue';
import { UnimplementedProcessorError } from '@/worker/processors/unimplemented';

export async function processExecution(
  job: Job<ExecutionPayload>,
): Promise<void> {
  executionPayload.parse(job.data);
  throw new UnimplementedProcessorError('execution');
}
