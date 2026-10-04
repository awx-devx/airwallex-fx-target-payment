import { createHash } from 'node:crypto';
import path from 'node:path';
import type { BillSummary } from '@/contracts/bill';
import { extractedBillSchema, type ExtractionStage } from '@/contracts/extraction';
import type { Clock } from '@/server/adapters/clock';
import { ExtractionBudgetError, extractionAllowance } from '@/server/adapters/extraction/budget';
import { localStorage, type StoredFile } from '@/server/adapters/storage/local';
import { toDecimal128 } from '@/server/db/decimal';
import { Bill, BillDocument } from '@/server/db/models';
import { listBills } from '@/server/db/repositories/bills';
import { accountDate, defaultLeadDays, executionSchedule, utcDateOnly } from '@/server/domain/deadline';
import type { Env } from '@/server/env';
import { uploadFile } from '@/server/adapters/airwallex/endpoints/files';
import { applyExtractedBill } from '@/server/services/applyExtraction';
import { requireAirwallex } from '@/server/services/airwallexClient';
import { eventPublisher, todayFor } from '@/server/services/bills';
import { ServiceError, invalid } from '@/server/services/errors';

const ACCEPTED = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']);
const MAX_BYTES = 20 * 1024 * 1024;

export interface UploadInput {
  filename: string;
  mime: string;
  bytes: Uint8Array;
}

export async function ingestUploads(input: {
  files: UploadInput[];
  env: Env;
  clock: Clock;
  storage?: ReturnType<typeof localStorage>;
  enqueue: (documentId: string) => Promise<void>;
}): Promise<BillSummary[]> {
  if (input.files.length === 0) throw invalid('Choose at least one file');
  for (const file of input.files) {
    if (!ACCEPTED.has(file.mime)) throw invalid(`${safeName(file.filename)} must be a PDF, PNG, or JPG`);
    if (file.bytes.byteLength === 0 || file.bytes.byteLength > MAX_BYTES) {
      throw invalid(`${safeName(file.filename)} must be under 20 MB`);
    }
  }
  const storage = input.storage ?? localStorage();
  const today = todayFor(input.env, input.clock);
  await assertExtractionRoom(input);
  const ids: string[] = [];
  for (const file of input.files) {
    const stored = await storage.put(file.filename, file.bytes);
    const billId = await createDraft(file.filename, stored, input);
    const cached = await BillDocument.findOne({
      sha256: stored.sha256,
      'extraction.status': 'DONE',
    }).lean();
    const result = extractedBillSchema.safeParse(readResult(cached));
    const airwallexFileId = await maybeUploadOriginal(input.env, file);
    const document = await BillDocument.create({
      billId,
      filename: safeName(file.filename),
      mime: file.mime === 'image/jpg' ? 'image/jpeg' : file.mime,
      size: stored.size,
      sha256: stored.sha256,
      storageKey: stored.storageKey,
      ...(airwallexFileId ? { airwallexFileId } : {}),
      extraction: result.success ? { status: 'DONE', result: result.data } : { status: 'PENDING' },
    });
    const documentId = String(document._id);
    if (result.success) {
      await applyExtractedBill(billId, result.data, input.env, input.clock);
      await publishStage(input.env, {
        billId,
        documentId,
        filename: safeName(file.filename),
        stage: 'solving',
        status: 'DONE',
      });
    } else {
      await publishStage(input.env, {
        billId,
        documentId,
        filename: safeName(file.filename),
        stage: 'working',
        status: 'PENDING',
      });
      await input.enqueue(documentId);
    }
    ids.push(billId);
  }
  const summaries = await listBills({}, input.env.DEMO_MODE, today);
  return summaries.filter((bill) => ids.includes(bill.id));
}

async function assertExtractionRoom(input: {
  files: UploadInput[];
  env: Env;
  clock: Clock;
}): Promise<void> {
  if (input.env.BILL_EXTRACTOR !== 'anthropic') return;
  const hashes = input.files.map((file) => createHash('sha256').update(file.bytes).digest('hex'));
  const done = await BillDocument.find({ sha256: { $in: hashes }, 'extraction.status': 'DONE' }).distinct('sha256');
  const cached = new Set(done);
  const fresh = hashes.filter((hash) => !cached.has(hash)).length;
  if (fresh === 0) return;
  let remaining: number;
  try {
    remaining = await extractionAllowance({
      redisUrl: input.env.REDIS_URL,
      maxCalls: input.env.EXTRACTION_MAX_CALLS,
      windowSec: input.env.EXTRACTION_WINDOW_SEC,
      nowMs: input.clock.now().getTime(),
    });
  } catch (error) {
    const message = error instanceof ExtractionBudgetError ? error.message : 'Extraction rate limit could not be recorded';
    throw new ServiceError('RATE_LIMITED', message, 429);
  }
  if (fresh > remaining) {
    throw new ServiceError('RATE_LIMITED', 'Extraction rate limit reached. Try again later.', 429);
  }
}

async function createDraft(
  filename: string,
  stored: StoredFile,
  input: { env: Env; clock: Clock },
): Promise<string> {
  const today = accountDate(input.clock.now(), input.env.AIRWALLEX_ACCOUNT_TZ);
  const leadDays = defaultLeadDays('LOCAL');
  const schedule = executionSchedule({
    dueDate: today,
    leadDays,
    cutoff: input.env.DEADLINE_AUTOSETTLE_CUTOFF,
    timeZone: input.env.AIRWALLEX_ACCOUNT_TZ,
  });
  const stem = safeName(filename).replace(/\.[^.]+$/, '') || 'Pending';
  const invoiceNumber = `pending-${stored.sha256.slice(0, 12)}`;
  const bill = await Bill.create({
    state: 'DRAFT',
    vendorName: stem.slice(0, 120),
    invoiceNumber,
    billCurrency: input.env.HOME_CURRENCY,
    billAmount: toDecimal128('0'),
    homeCurrency: input.env.HOME_CURRENCY,
    dueDate: utcDateOnly(today),
    executionDeadline: utcDateOnly(schedule.executionDeadline),
    transferMethod: 'LOCAL',
    leadDays,
    transferReason: 'bill_payment',
    reference: invoiceNumber,
  });
  return String(bill._id);
}

async function maybeUploadOriginal(env: Env, file: UploadInput): Promise<string | undefined> {
  if (!env.SPEND_SYNC || !env.FILES_UPLOAD || !env.AIRWALLEX_CLIENT_ID || !env.AIRWALLEX_API_KEY) {
    return undefined;
  }
  try {
    const payload = await uploadFile(requireAirwallex(env), {
      filename: safeName(file.filename).slice(0, 50),
      bytes: file.bytes,
      contentType: file.mime,
    });
    if (payload && typeof payload === 'object' && 'file_id' in payload && typeof payload.file_id === 'string') {
      return payload.file_id;
    }
  } catch {
    // The local copy is enough for extraction. Spend attachment is optional.
  }
  return undefined;
}

function readResult(doc: { extraction?: { result?: unknown } } | null): unknown {
  return doc?.extraction?.result;
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
    // Progress is best-effort. The document status remains the source of truth.
  }
}

export function safeName(filename: string): string {
  const base = path.basename(filename).replaceAll(/[^\w.\- ]+/g, '');
  return base.length > 0 ? base.slice(0, 180) : 'invoice';
}
