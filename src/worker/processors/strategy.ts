import type { Job } from 'bullmq';
import { strategyPayload, type StrategyPayload } from '@/server/queue';
import { UnimplementedProcessorError } from '@/worker/processors/unimplemented';

export async function processStrategy(
  job: Job<StrategyPayload>,
): Promise<void> {
  strategyPayload.parse(job.data);
  throw new UnimplementedProcessorError('strategy');
}
