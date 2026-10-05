import { Queue } from 'bullmq';
import { createQueue, jobIds, type ExecutionPayload, type QueueName } from '@/server/queue';

const open = new Map<QueueName, Queue>();

export function workQueue(name: QueueName, url: string): Queue {
  const existing = open.get(name);
  if (existing) return existing;
  const created = createQueue(name, { url });
  open.set(name, created);
  return created;
}

export async function closeWorkQueues(): Promise<void> {
  const queues = [...open.values()];
  open.clear();
  await Promise.all(queues.map((queue) => queue.close()));
}

async function addJob(
  name: QueueName,
  url: string,
  jobName: string,
  data: object,
  jobId: string,
  replaceFinished: boolean,
): Promise<void> {
  const queue = workQueue(name, url);
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (!replaceFinished || (state !== 'completed' && state !== 'failed')) return;
    await existing.remove();
  }
  try {
    await queue.add(jobName, data, { jobId });
  } catch (error) {
    if (error instanceof Error && /already exists/i.test(error.message)) return;
    throw error;
  }
}

export async function enqueueStrategy(url: string, billId: string, tickId: string): Promise<void> {
  await addJob('strategy', url, 'strategy', { billId, tickId }, jobIds.trigger(billId, tickId), false);
}

export async function enqueueQuoteRetry(url: string, billId: string): Promise<void> {
  await addJob('quote-retry', url, 'quote-retry', { billId }, jobIds.quoteRetry(billId), true);
}

export async function enqueueExecution(
  url: string,
  billId: string,
  attempt: number,
  mode: ExecutionPayload['mode'],
): Promise<void> {
  await addJob(
    'execution',
    url,
    'execution',
    { billId, attempt, mode },
    jobIds.execute(billId, attempt),
    false,
  );
}
