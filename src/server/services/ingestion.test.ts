import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GET as banks } from '@/app/api/beneficiaries/banks/route';
import { GET as currencies } from '@/app/api/reference/currencies/route';
import { GET as quota } from '@/app/api/reference/quota/route';
import { SystemClock } from '@/server/adapters/clock';
import { closeExtractionBudget, takeExtractionCall } from '@/server/adapters/extraction/budget';
import { forgetTruth, rememberTruth } from '@/server/adapters/extraction/mock';
import { localStorage } from '@/server/adapters/storage/local';
import { toDecimal128 } from '@/server/db/decimal';
import { Beneficiary, Bill, BillDocument } from '@/server/db/models';
import { getEnv, parseEnv } from '@/server/env';
import { resolveBeneficiary, closeBeneficiaryCache } from '@/server/services/beneficiaries';
import { closeEventPublisher, getBill, todayFor } from '@/server/services/bills';
import { extractDocument } from '@/server/services/extractDocument';
import { closeReferenceCache } from '@/server/services/reference';
import { ingestUploads } from '@/server/services/uploads';
import { bootDb, shutdownDb } from '@/server/test/harness';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('bill ingestion', () => {
  let root = '';

  beforeAll(async () => {
    await bootDb();
    root = await mkdtemp(path.join(tmpdir(), 'fx-uploads-'));
  });

  afterAll(async () => {
    forgetTruth();
    await closeEventPublisher();
    await closeReferenceCache();
    await closeBeneficiaryCache();
    await closeExtractionBudget();
    await rm(root, { recursive: true, force: true });
    await shutdownDb();
  });

  it('stores a file, extracts generator truth, and fills the draft', async () => {
    const sha256 = createHash('sha256').update(PNG).digest('hex');
    rememberTruth(sha256, {
      seed: 7,
      vendor: { name: 'Kessler Maschinenbau GmbH', country: 'DE' },
      invoiceNumber: 'KM-2026-0147',
      currency: 'EUR',
      subtotal: '210084.03',
      tax: '39915.97',
      total: '250000.00',
      issueDate: '2026-09-28',
      dueDate: '2026-10-28',
      bank: { iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', accountName: 'Kessler Maschinenbau GmbH' },
    });
    const env = getEnv();
    const clock = new SystemClock(() => Date.parse('2026-10-05T12:00:00.000Z'));
    let documentId = '';
    const bills = await ingestUploads({
      files: [{ filename: 'kessler.png', mime: 'image/png', bytes: PNG }],
      env,
      clock,
      storage: localStorage(root),
      enqueue: async (id) => {
        documentId = id;
      },
    });
    expect(bills).toHaveLength(1);
    expect(bills[0]?.state).toBe('DRAFT');
    await extractDocument({
      documentId,
      env,
      clock,
      storage: localStorage(root),
    });
    const detail = await getBill(String(bills[0]?.id), true, todayFor(env, clock));
    expect(detail.vendorName).toBe('Kessler Maschinenbau GmbH');
    expect(detail.invoiceNumber).toBe('KM-2026-0147');
    expect(detail.pair.base).toBe('EUR');
    expect(detail.amount).toBe('250000');
    expect(detail.documents[0]?.extraction?.status).toBe('DONE');
    expect(detail.documents[0]?.extraction?.result?.bank.iban?.value).toBe('DE89370400440532013000');
    const stored = await BillDocument.findById(documentId).lean();
    expect(stored?.sha256).toBe(sha256);
  });

  it('matches an existing beneficiary by name and account ending', async () => {
    const env = getEnv();
    const clock = new SystemClock(() => Date.parse('2026-10-05T12:00:00.000Z'));
    const bill = await Bill.create({
      state: 'DRAFT',
      vendorName: 'Pending',
      invoiceNumber: 'pending-match',
      billCurrency: 'EUR',
      billAmount: toDecimal128('100.00'),
      homeCurrency: 'USD',
      dueDate: new Date('2026-11-01T00:00:00.000Z'),
      executionDeadline: new Date('2026-10-30T00:00:00.000Z'),
      transferMethod: 'LOCAL',
      leadDays: 1,
      transferReason: 'bill_payment',
      reference: 'pending-match',
    });
    await Beneficiary.create({
      airwallexBeneficiaryId: 'ben-existing',
      name: 'Kessler Maschinenbau GmbH',
      entityType: 'COMPANY',
      bankCountry: 'DE',
      accountCurrency: 'EUR',
      maskedAccount: '••••3000',
      transferMethods: ['LOCAL'],
    });
    const summary = await resolveBeneficiary({
      billId: String(bill._id),
      env,
      clock,
      body: {
        name: 'kessler maschinenbau gmbh',
        entityType: 'COMPANY',
        bankCountry: 'DE',
        accountCurrency: 'EUR',
        transferMethod: 'LOCAL',
        iban: 'DE89370400440532013000',
      },
    });
    expect(summary.airwallexBeneficiaryId).toBe('ben-existing');
    expect(summary.maskedAccount).toBe('••••3000');
  });

  it('serves static currencies, an empty holiday list, and a mock quota', async () => {
    const listed = await currencies();
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { code: string }[];
    expect(body.some((currency) => currency.code === 'EUR')).toBe(true);

    const banksResponse = await banks(new Request('http://localhost/api/beneficiaries/banks?accountCurrency=EUR&bankCountryCode=DE&entityType=COMPANY&transferMethod=LOCAL'));
    expect(banksResponse.status).toBe(200);

    const quotaResponse = await quota(new Request('http://localhost/api/reference/quota?type=ID_OUTBOUND'));
    expect(quotaResponse.status).toBe(200);
    expect(await quotaResponse.json()).toMatchObject({ type: 'ID_OUTBOUND', currency: 'IDR' });
  });

  it('refuses an anthropic upload when the window is full and writes no bill', async () => {
    const env = parseEnv({
      ...process.env,
      BILL_EXTRACTOR: 'anthropic',
      EXTRACTION_MAX_CALLS: '1',
      EXTRACTION_WINDOW_SEC: '3600',
    });
    const now = Date.parse('2030-01-01T00:00:00.000Z');
    await takeExtractionCall({
      redisUrl: env.REDIS_URL,
      maxCalls: env.EXTRACTION_MAX_CALLS,
      windowSec: env.EXTRACTION_WINDOW_SEC,
      nowMs: now,
    });
    const bytes = new Uint8Array(PNG);
    bytes[bytes.length - 1] = bytes[bytes.length - 1] === 0 ? 1 : 0;
    const before = await Bill.countDocuments();
    const clock = new SystemClock(() => now);
    await expect(
      ingestUploads({
        files: [{ filename: 'over-cap.png', mime: 'image/png', bytes }],
        env,
        clock,
        storage: localStorage(root),
        enqueue: async () => {
          throw new Error('should not enqueue');
        },
      }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    expect(await Bill.countDocuments()).toBe(before);
  });
});
