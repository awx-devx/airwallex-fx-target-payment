import { extractedBillSchema, type ExtractedBill, type ExtractedField } from '@/contracts/extraction';
import { missing, taken } from '@/server/adapters/extraction/fields';
import { PROMPT_VERSION } from '@/server/adapters/extraction/prompt';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface GeneratorTruth {
  seed?: number;
  vendor: { name: string; country: string };
  invoiceNumber: string;
  currency: string;
  subtotal?: string;
  tax?: string;
  total: string;
  issueDate: string;
  dueDate: string;
  bank?: {
    iban?: string;
    bic?: string;
    accountName?: string;
    accountNumber?: string;
    localBankCode?: string;
  };
}

const memory = new Map<string, GeneratorTruth>();

/** Tests and the generator index register truth by file hash. */
export function rememberTruth(sha256: string, truth: GeneratorTruth): void {
  memory.set(sha256, truth);
}

export function forgetTruth(): void {
  memory.clear();
}

export async function mockExtraction(sha256: string): Promise<ExtractedBill> {
  const truth = memory.get(sha256) ?? (await readIndex(sha256));
  if (!truth) return canned();
  return fromTruth(truth);
}

function fromTruth(truth: GeneratorTruth): ExtractedBill {
  const bank = truth.bank ?? {};
  const bill = extractedBillSchema.parse({
    documentType: 'invoice',
    vendorName: taken(truth.vendor.name, 'llm'),
    vendorCountry: taken(truth.vendor.country, 'llm'),
    invoiceNumber: taken(truth.invoiceNumber, 'llm'),
    currency: taken(truth.currency, 'llm'),
    amountDue: taken(truth.total, 'llm'),
    ...(truth.subtotal ? { subtotal: taken(truth.subtotal, 'llm') } : {}),
    ...(truth.tax ? { tax: taken(truth.tax, 'llm') } : {}),
    issueDate: taken(truth.issueDate, 'llm'),
    dueDate: taken(truth.dueDate, 'llm'),
    bank: {
      ...(bank.accountName ? { accountName: taken(bank.accountName, 'llm') } : {}),
      ...(bank.iban ? { iban: taken(bank.iban, 'llm') } : {}),
      ...(bank.bic ? { bic: taken(bank.bic, 'llm') } : {}),
      ...(bank.accountNumber ? { accountNumber: taken(bank.accountNumber, 'llm') } : {}),
      ...(bank.localBankCode ? { localBankCode: taken(bank.localBankCode, 'llm') } : {}),
    },
    warnings: [],
    meta: baseMeta(),
  });
  return lowerSome(bill, truth.seed ?? 0);
}

function lowerSome(bill: ExtractedBill, seed: number): ExtractedBill {
  const keys = ['vendorCountry', 'paymentReference'] as const;
  const key = keys[Math.abs(seed) % keys.length] ?? 'vendorCountry';
  if (key === 'vendorCountry') {
    return { ...bill, vendorCountry: soften(bill.vendorCountry) };
  }
  return bill;
}

function soften(field: ExtractedField): ExtractedField {
  return { ...field, confidence: 'medium', reasons: ['confirm this field'] };
}

function canned(): ExtractedBill {
  return extractedBillSchema.parse({
    documentType: 'invoice',
    vendorName: missing(),
    vendorCountry: missing(),
    invoiceNumber: missing(),
    currency: missing(),
    amountDue: missing(),
    issueDate: missing(),
    dueDate: missing(),
    bank: {},
    warnings: [{ code: 'UNREADABLE', message: 'This file is not in the generator index' }],
    meta: baseMeta(),
  });
}

function baseMeta(): ExtractedBill['meta'] {
  return {
    extractor: 'mock',
    promptVersion: PROMPT_VERSION,
    escalated: false,
    pages: 1,
    textLayer: false,
    ms: 0,
  };
}

async function readIndex(sha256: string): Promise<GeneratorTruth | undefined> {
  try {
    const raw = await readFile(path.join(process.cwd(), 'generated', 'index.json'), 'utf8');
    const parsed = JSON.parse(raw) as { files?: { sha256?: string; truth?: GeneratorTruth }[] };
    return parsed.files?.find((file) => file.sha256 === sha256)?.truth;
  } catch {
    return undefined;
  }
}
