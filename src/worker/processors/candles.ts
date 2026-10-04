import { SystemClock } from '@/server/adapters/clock';
import { candlesPayload } from '@/server/queue';
import { rollupMinute } from '@/server/services/candles';
import type { Job } from 'bullmq';

export async function processCandles(job: Job): Promise<void> {
  candlesPayload.parse(job.data);
  await rollupMinute(new SystemClock().now());
}