import type { Processor } from 'bullmq';
import type { QueueName } from '@/server/queue';
import { processDeadline } from '@/worker/processors/deadline';
import { processExecution } from '@/worker/processors/execution';
import { processExtraction } from '@/worker/processors/extraction';
import { processNotify } from '@/worker/processors/notify';
import { processQuoteRetry } from '@/worker/processors/quoteRetry';
import { processReconcile } from '@/worker/processors/reconcile';
import { processStrategy } from '@/worker/processors/strategy';
import { processWebhook } from '@/worker/processors/webhook';

export type ProcessorMap = Record<QueueName, Processor>;

export const defaultProcessors: ProcessorMap = {
  extraction: processExtraction,
  strategy: processStrategy,
  deadline: processDeadline,
  'quote-retry': processQuoteRetry,
  execution: processExecution,
  webhook: processWebhook,
  notify: processNotify,
  reconcile: processReconcile,
};
