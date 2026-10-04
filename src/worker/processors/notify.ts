import type { Job } from 'bullmq';
import { notifyPayload, type NotifyPayload } from '@/server/queue';
import { UnimplementedProcessorError } from '@/worker/processors/unimplemented';

export async function processNotify(job: Job<NotifyPayload>): Promise<void> {
  notifyPayload.parse(job.data);
  throw new UnimplementedProcessorError('notify');
}
