import { createQueue, jobIds, type QueueName } from '@/server/queue';
import type { Queue } from 'bullmq';

let queue: Queue | undefined;

export function extractionQueue(url: string): Queue {
  queue ??= createQueue('extraction' satisfies QueueName, { url });
  return queue;
}

export async function enqueueExtraction(url: string, documentId: string): Promise<void> {
  try {
    await extractionQueue(url).add('extract', { documentId }, { jobId: jobIds.extract(documentId) });
  } catch (error) {
    if (error instanceof Error && /already exists/i.test(error.message)) return;
    throw error;
  }
}

export async function closeExtractionQueue(): Promise<void> {
  const current = queue;
  queue = undefined;
  if (current) await current.close();
}
