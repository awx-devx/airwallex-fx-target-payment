import { Queue, Worker, type Job, type Processor } from 'bullmq';
import { z } from 'zod';

/** Attempts match the Retries column in docs/02 §9.2 (total tries). */
export const QUEUE_CONFIG = {
  extraction: {
    concurrency: 4,
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5_000 },
  },
  strategy: { concurrency: 4, attempts: 2 },
  deadline: {
    concurrency: 2,
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: 10_000 },
  },
  'quote-retry': { concurrency: 4, attempts: 3 },
  execution: {
    concurrency: 2,
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: 2_000 },
  },
  webhook: {
    concurrency: 4,
    attempts: 10,
    backoff: { type: 'exponential' as const, delay: 5_000 },
  },
  notify: { concurrency: 4, attempts: 5 },
  reconcile: { concurrency: 1 },
} as const;

export const QUEUE_NAMES = [
  'extraction',
  'strategy',
  'deadline',
  'quote-retry',
  'execution',
  'webhook',
  'notify',
  'reconcile',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

const RETENTION = {
  removeOnComplete: { age: 86_400, count: 1000 },
  removeOnFail: { age: 604_800 },
} as const;

/** BullMQ rejects `:` in a custom job id. `.` keeps the id deterministic. */
function part(value: string): string {
  return value.replaceAll(':', '_');
}

export const jobIds = {
  extract: (documentId: string) => `extract.${part(documentId)}`,
  trigger: (billId: string, tickId: string) =>
    `trigger.${part(billId)}.${part(tickId)}`,
  deadlineAutosettle: (billId: string) => `deadline.autosettle.${part(billId)}`,
  quoteRetry: (billId: string) => `quote-retry.${part(billId)}`,
  execute: (billId: string, attempt: number) =>
    `execute.${part(billId)}.${attempt}`,
  webhook: (eventId: string) => `webhook.${part(eventId)}`,
  notify: (notificationId: string) => `notify.${part(notificationId)}`,
};

export const extractionPayload = z.object({ documentId: z.string().min(1) });
export const strategyPayload = z.object({
  billId: z.string().min(1),
  tickId: z.string().min(1),
});
export const deadlinePayload = z.object({ billId: z.string().min(1) });
export const quoteRetryPayload = z.object({ billId: z.string().min(1) });
export const executionPayload = z.object({
  billId: z.string().min(1),
  attempt: z.number().int().positive(),
});
export const webhookPayload = z.object({ eventId: z.string().min(1) });
export const notifyPayload = z.object({ notificationId: z.string().min(1) });
export const reconcilePayload = z.object({});

export const PAYLOADS = {
  extraction: extractionPayload,
  strategy: strategyPayload,
  deadline: deadlinePayload,
  'quote-retry': quoteRetryPayload,
  execution: executionPayload,
  webhook: webhookPayload,
  notify: notifyPayload,
  reconcile: reconcilePayload,
} as const;

export type ExtractionPayload = z.infer<typeof extractionPayload>;
export type StrategyPayload = z.infer<typeof strategyPayload>;
export type DeadlinePayload = z.infer<typeof deadlinePayload>;
export type QuoteRetryPayload = z.infer<typeof quoteRetryPayload>;
export type ExecutionPayload = z.infer<typeof executionPayload>;
export type WebhookPayload = z.infer<typeof webhookPayload>;
export type NotifyPayload = z.infer<typeof notifyPayload>;
export type ReconcilePayload = z.infer<typeof reconcilePayload>;

export function bullConnection(url: string) {
  return { url, maxRetriesPerRequest: null as null };
}

export function createQueue(
  name: QueueName,
  options: { url: string; prefix?: string },
) {
  const config = QUEUE_CONFIG[name];
  return new Queue(name, {
    connection: bullConnection(options.url),
    prefix: options.prefix ?? 'bull',
    defaultJobOptions: {
      ...('attempts' in config ? { attempts: config.attempts } : {}),
      ...('backoff' in config ? { backoff: config.backoff } : {}),
      ...RETENTION,
    },
  });
}

export function createWorker(
  name: QueueName,
  processor: Processor,
  options: { url: string; prefix?: string },
) {
  return new Worker(name, processor, {
    connection: bullConnection(options.url),
    prefix: options.prefix ?? 'bull',
    concurrency: QUEUE_CONFIG[name].concurrency,
  });
}

export type { Job, Processor };
