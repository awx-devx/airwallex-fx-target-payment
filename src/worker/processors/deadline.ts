import type { Job } from 'bullmq';
import { deadlinePayload, type DeadlinePayload } from '@/server/queue';
import { UnimplementedProcessorError } from '@/worker/processors/unimplemented';

export async function processDeadline(
  job: Job<DeadlinePayload>,
): Promise<void> {
  deadlinePayload.parse(job.data);
  throw new UnimplementedProcessorError('deadline');
}
