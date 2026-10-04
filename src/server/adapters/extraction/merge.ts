import type { ExtractedBill, ExtractedField, ExtractionWarning } from '@/contracts/extraction';
import type { EinvoiceRead } from '@/server/adapters/extraction/einvoice';
import { missing } from '@/server/adapters/extraction/fields';
import type { QrPayment } from '@/server/adapters/extraction/qr';

/** Deterministic values win. A disagreement keeps them and lowers confidence. */
export function mergeExtraction(
  llm: ExtractedBill,
  sources: { xml?: EinvoiceRead; qr?: QrPayment },
): ExtractedBill {
  const warnings: ExtractionWarning[] = [...llm.warnings];
  const vendorName = prefer(sources.xml?.vendorName, undefined, llm.vendorName, warnings, 'vendor names');
  const invoiceNumber = prefer(sources.xml?.invoiceNumber, undefined, llm.invoiceNumber, warnings, 'invoice numbers');
  const currency = prefer(sources.xml?.currency, sources.qr?.currency, llm.currency, warnings, 'currencies');
  const amountDue = prefer(sources.xml?.amountDue, sources.qr?.amount, llm.amountDue, warnings, 'amounts');
  const bank = {
    accountName: prefer(undefined, sources.qr?.accountName, llm.bank.accountName, warnings, 'account names'),
    iban: prefer(sources.xml?.iban, sources.qr?.iban, llm.bank.iban, warnings, 'IBANs'),
    bic: prefer(sources.xml?.bic, sources.qr?.bic, llm.bank.bic, warnings, 'BICs'),
    accountNumber: llm.bank.accountNumber,
    localBankCode: llm.bank.localBankCode,
    bankCountry: llm.bank.bankCountry,
  };
  return {
    ...llm,
    vendorName,
    invoiceNumber,
    currency,
    amountDue,
    subtotal: sources.xml?.subtotal ?? llm.subtotal,
    tax: sources.xml?.tax ?? llm.tax,
    issueDate: sources.xml?.issueDate ?? llm.issueDate,
    dueDate: sources.xml?.dueDate ?? llm.dueDate,
    paymentReference: prefer(
      sources.xml?.paymentReference,
      sources.qr?.reference,
      llm.paymentReference,
      warnings,
      'references',
    ),
    bank,
    warnings,
  };
}

function prefer(
  xml: ExtractedField | undefined,
  qr: ExtractedField | undefined,
  llm: ExtractedField | undefined,
  warnings: ExtractionWarning[],
  label: string,
): ExtractedField {
  const deterministic = xml ?? qr;
  const model = llm ?? missing();
  if (!deterministic?.value) return model;
  if (model.value && normalise(model.value) !== normalise(deterministic.value)) {
    if (!warnings.some((warning) => warning.code === 'CONFLICT')) {
      warnings.push({
        code: 'CONFLICT',
        message: label === 'IBANs' ? 'document shows two different IBANs' : `document shows two different ${label}`,
      });
    }
    return {
      ...deterministic,
      confidence: 'medium',
      reasons: [...(deterministic.reasons ?? []), disagreement(label)],
    };
  }
  return deterministic;
}

function disagreement(label: string): string {
  return label === 'IBANs' ? 'document shows two different IBANs' : `document shows two different ${label}`;
}

function normalise(value: string): string {
  return value.replaceAll(/[\s-]/g, '').toUpperCase();
}
