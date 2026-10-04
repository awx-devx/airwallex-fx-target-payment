import type { Job } from 'bullmq';
import { reconcilePayload, type ReconcilePayload } from '@/server/queue';
import { UnimplementedProcessorError } from '@/worker/processors/unimplemented';

export async function processReconcile(
  job: Job<ReconcilePayload>,
): Promise<void> {
  reconcilePayload.parse(job.data);
  throw new UnimplementedProcessorError('reconcile');
}
