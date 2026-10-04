import type { Clock } from '@/server/adapters/clock';
import {
  billExtractor,
  RetryableExtractionError,
  runPipeline,
  UnreadableDocumentError,
} from '@/server/adapters/extraction';
import { localStorage } from '@/server/adapters/storage/local';
import { BillDocument } from '@/server/db/models';
import type { Env } from '@/server/env';
import { applyExtractedBill, saveExtraction } from '@/server/services/applyExtraction';
import { eventPublisher, todayFor } from '@/server/services/bills';
import type { ExtractionStage } from '@/contracts/extraction';

export async function extractDocument(input: {
  documentId: string;
  env: Env;
  clock: Clock;
  storage?: ReturnType<typeof localStorage>;
}): Promise<void> {
  const document = await BillDocument.findById(input.documentId);
  if (!document || document.extraction.status === 'DONE') return;
  document.extraction.status = 'RUNNING';
  await document.save();
  const billId = String(document.billId);
  await publishStage(input.env, {
    billId,
    documentId: input.documentId,
    filename: document.filename,
    stage: 'searching',
    status: 'RUNNING',
  });
  const bytes = await (input.storage ?? localStorage()).read(document.storageKey);
  const started = input.clock.now().getTime();
  try {
    const result = await runPipeline({
      bytes,
      mime: document.mime,
      maxPages: input.env.EXTRACTION_MAX_PAGES,
      homeCurrency: input.env.HOME_CURRENCY,
      today: todayFor(input.env, input.clock),
      duplicate: false,
      escalate: input.env.EXTRACTION_ESCALATE && input.env.BILL_EXTRACTOR !== 'mock',
      extractor: billExtractor(input.env, document.sha256, () => input.clock.now().getTime()),
      startedAtMs: started,
      nowMs: () => input.clock.now().getTime(),
      onStage: async (stage) => {
        await publishStage(input.env, {
          billId,
          documentId: input.documentId,
          filename: document.filename,
          stage,
          status: 'RUNNING',
        });
      },
    });
    const applied = await applyExtractedBill(billId, result, input.env, input.clock);
    await saveExtraction(input.documentId, applied);
    await publishStage(input.env, {
      billId,
      documentId: input.documentId,
      filename: document.filename,
      stage: 'solving',
      status: 'DONE',
    });
  } catch (error) {
    if (error instanceof UnreadableDocumentError) {
      await saveExtraction(input.documentId, undefined, error.message);
      await publishStage(input.env, {
        billId,
        documentId: input.documentId,
        filename: document.filename,
        stage: 'solving',
        status: 'FAILED',
      });
    }
    throw error;
  }
}

export async function markExtractionFailed(documentId: string, message: string, env: Env): Promise<void> {
  const document = await BillDocument.findById(documentId);
  if (!document || document.extraction.status === 'DONE') return;
  await saveExtraction(documentId, undefined, message);
  await publishStage(env, {
    billId: String(document.billId),
    documentId,
    filename: document.filename,
    stage: 'solving',
    status: 'FAILED',
  });
}

async function publishStage(
  env: Env,
  event: {
    billId: string;
    documentId: string;
    filename: string;
    stage: ExtractionStage;
    status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  },
): Promise<void> {
  try {
    await eventPublisher(env.REDIS_URL).publish({ type: 'extraction.progress', ...event });
  } catch {
    // Progress is best-effort.
  }
}

export { RetryableExtractionError, UnreadableDocumentError };
