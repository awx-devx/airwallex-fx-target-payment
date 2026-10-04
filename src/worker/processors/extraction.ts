import { SystemClock } from '@/server/adapters/clock';
import { ExtractionBudgetError } from '@/server/adapters/extraction/budget';
import { extractionPayload, type ExtractionPayload } from '@/server/queue';
import { getEnv } from '@/server/env';
import {
  extractDocument,
  markExtractionFailed,
  UnreadableDocumentError,
} from '@/server/services/extractDocument';
import { UnrecoverableError, type Job } from 'bullmq';

export async function processExtraction(job: Job<ExtractionPayload>): Promise<void> {
  const { documentId } = extractionPayload.parse(job.data);
  const env = getEnv();
  const clock = new SystemClock();
  try {
    await extractDocument({ documentId, env, clock });
  } catch (error) {
    if (error instanceof UnreadableDocumentError) {
      throw new UnrecoverableError(error.message);
    }
    if (error instanceof ExtractionBudgetError) {
      await markExtractionFailed(documentId, error.message, env);
      throw new UnrecoverableError(error.message);
    }
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade + 1 >= attempts) {
      const message = error instanceof Error ? error.message : 'Extraction failed';
      await markExtractionFailed(documentId, message, env);
    }
    throw error;
  }
}
