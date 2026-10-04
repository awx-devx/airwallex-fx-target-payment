import type { ExtractedBill, ExtractionStage } from '@/contracts/extraction';
import { ExtractionBudgetError } from '@/server/adapters/extraction/budget';
import { readEinvoice } from '@/server/adapters/extraction/einvoice';
import { missing } from '@/server/adapters/extraction/fields';
import { mergeExtraction } from '@/server/adapters/extraction/merge';
import { preflight, UnreadableDocumentError } from '@/server/adapters/extraction/preflight';
import { decodeQrImages, parsePaymentQr, type QrPayment } from '@/server/adapters/extraction/qr';
import { boxesFor, crossCheck, textCandidates, type TextItemBox } from '@/server/adapters/extraction/textLayer';
import { validateExtraction } from '@/server/adapters/extraction/validators';

export interface ModelExtraction {
  bill: ExtractedBill;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface BillExtractor {
  extract(input: {
    bytes: Uint8Array;
    mime: string;
    pages: number;
    textLayer: boolean;
    strong: boolean;
  }): Promise<ModelExtraction>;
}

export async function runPipeline(input: {
  bytes: Uint8Array;
  mime: string;
  maxPages: number;
  homeCurrency: string;
  today: string;
  duplicate: boolean;
  escalate: boolean;
  extractor: BillExtractor;
  startedAtMs: number;
  nowMs: () => number;
  onStage?: (stage: ExtractionStage) => Promise<void>;
}): Promise<ExtractedBill> {
  await input.onStage?.('searching');
  const prepared = await preflight(input.bytes, input.mime, input.maxPages);
  const xml = prepared.attachments
    .map((file) => readEinvoice(Buffer.from(file.bytes).toString('utf8')))
    .find((read) => read);
  const qr = await readQr(prepared.renders);
  const candidates = textCandidates(prepared.items);
  await input.onStage?.('solving');
  let model = await input.extractor.extract({
    bytes: input.bytes,
    mime: input.mime,
    pages: prepared.pages,
    textLayer: prepared.textLayer,
    strong: false,
  });
  let merged = finish(model.bill, xml, qr, candidates, prepared.items, input);
  const weak = prepared.scanned || needsStrongerModel(merged);
  if (input.escalate && weak) {
    try {
      const strong = await input.extractor.extract({
        bytes: input.bytes,
        mime: input.mime,
        pages: prepared.pages,
        textLayer: prepared.textLayer,
        strong: true,
      });
      model = strong;
      merged = finish(strong.bill, xml, qr, candidates, prepared.items, input);
      merged = {
        ...merged,
        meta: { ...merged.meta, escalated: true, model: strong.model ?? merged.meta.model },
      };
    } catch (error) {
      if (!(error instanceof ExtractionBudgetError)) throw error;
    }
  }
  return {
    ...merged,
    meta: {
      ...merged.meta,
      pages: prepared.pages,
      textLayer: prepared.textLayer,
      ms: Math.max(0, input.nowMs() - input.startedAtMs),
      ...(model.model ? { model: model.model } : {}),
      ...(model.inputTokens !== undefined ? { inputTokens: model.inputTokens } : {}),
      ...(model.outputTokens !== undefined ? { outputTokens: model.outputTokens } : {}),
    },
  };
}

export { UnreadableDocumentError };

function finish(
  llm: ExtractedBill,
  xml: ReturnType<typeof readEinvoice>,
  qr: QrPayment | undefined,
  candidates: ReturnType<typeof textCandidates>,
  items: TextItemBox[],
  input: { homeCurrency: string; today: string; duplicate: boolean },
): ExtractedBill {
  const merged = mergeExtraction(llm, { ...(xml ? { xml } : {}), ...(qr ? { qr } : {}) });
  const checked = validateExtraction(
    {
      ...merged,
      bank: {
        ...merged.bank,
        iban: crossCheck(merged.bank.iban, candidates.ibans, 'IBAN'),
        bic: crossCheck(merged.bank.bic, candidates.bics, 'BIC'),
        localBankCode: crossCheck(merged.bank.localBankCode, [...candidates.ifscs, ...candidates.sortCodes], 'bank code'),
      },
    },
    input,
  );
  return attachBoxes(checked, items);
}

async function readQr(renders: Uint8Array[]): Promise<QrPayment | undefined> {
  let payloads: string[] = [];
  try {
    payloads = await decodeQrImages(renders);
  } catch {
    payloads = [];
  }
  for (const payload of payloads) {
    const payment = parsePaymentQr(payload);
    if (payment) return payment;
  }
  return undefined;
}

function needsStrongerModel(bill: ExtractedBill): boolean {
  const required = [bill.vendorName, bill.invoiceNumber, bill.currency, bill.amountDue, bill.dueDate];
  if (required.some((field) => !field.value || field.confidence === 'low')) return true;
  return bill.warnings.some((warning) => warning.code === 'CONFLICT' || warning.code === 'UNREADABLE');
}

function attachBoxes(bill: ExtractedBill, items: TextItemBox[]): ExtractedBill {
  const withBoxes = (field: ExtractedBill['vendorName'] | undefined) => {
    if (!field) return field;
    const boxes = boxesFor(field, items);
    return boxes ? { ...field, boxes } : field;
  };
  return {
    ...bill,
    vendorName: withBoxes(bill.vendorName) ?? missing(),
    vendorCountry: withBoxes(bill.vendorCountry) ?? missing(),
    invoiceNumber: withBoxes(bill.invoiceNumber) ?? missing(),
    currency: withBoxes(bill.currency) ?? missing(),
    amountDue: withBoxes(bill.amountDue) ?? missing(),
    ...(bill.subtotal ? { subtotal: withBoxes(bill.subtotal) } : {}),
    ...(bill.tax ? { tax: withBoxes(bill.tax) } : {}),
    issueDate: withBoxes(bill.issueDate) ?? missing(),
    dueDate: withBoxes(bill.dueDate) ?? missing(),
    ...(bill.paymentReference ? { paymentReference: withBoxes(bill.paymentReference) } : {}),
    bank: {
      ...(bill.bank.accountName ? { accountName: withBoxes(bill.bank.accountName) } : {}),
      ...(bill.bank.iban ? { iban: withBoxes(bill.bank.iban) } : {}),
      ...(bill.bank.bic ? { bic: withBoxes(bill.bank.bic) } : {}),
      ...(bill.bank.accountNumber ? { accountNumber: withBoxes(bill.bank.accountNumber) } : {}),
      ...(bill.bank.localBankCode ? { localBankCode: withBoxes(bill.bank.localBankCode) } : {}),
      ...(bill.bank.bankCountry ? { bankCountry: withBoxes(bill.bank.bankCountry) } : {}),
    },
  };
}
