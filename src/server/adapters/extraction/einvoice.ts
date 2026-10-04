import type { ExtractedField } from '@/contracts/extraction';
import { taken } from '@/server/adapters/extraction/fields';
import { XMLParser } from 'fast-xml-parser';

export interface EinvoiceRead {
  vendorName?: ExtractedField;
  invoiceNumber?: ExtractedField;
  currency?: ExtractedField;
  amountDue?: ExtractedField;
  subtotal?: ExtractedField;
  tax?: ExtractedField;
  issueDate?: ExtractedField;
  dueDate?: ExtractedField;
  iban?: ExtractedField;
  bic?: ExtractedField;
  paymentReference?: ExtractedField;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});

/** Factur-X / ZUGFeRD CII and UBL. Deterministic, so every value is high confidence. */
export function readEinvoice(xml: string): EinvoiceRead | undefined {
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch {
    return undefined;
  }
  const root = record(parsed);
  if (!root) return undefined;
  const cii = record(root.CrossIndustryInvoice);
  if (cii) return readCii(cii);
  const ubl = record(root.Invoice) ?? record(root.CreditNote);
  if (ubl) return readUbl(ubl);
  return undefined;
}

function readCii(root: Record<string, unknown>): EinvoiceRead {
  const document = record(root.ExchangedDocument);
  const transaction = record(root.SupplyChainTradeTransaction);
  const agreement = record(transaction?.ApplicableHeaderTradeAgreement);
  const seller = record(agreement?.SellerTradeParty);
  const settlement = record(transaction?.ApplicableHeaderTradeSettlement);
  const monetary = record(settlement?.SpecifiedTradeSettlementHeaderMonetarySummation);
  const payment = record(settlement?.SpecifiedTradeSettlementPaymentMeans);
  const account = record(payment?.PayeePartyCreditorFinancialAccount);
  const institution = record(payment?.PayeeSpecifiedCreditorFinancialInstitution);
  const currency = text(settlement?.InvoiceCurrencyCode);
  return compact({
    vendorName: textField(text(seller?.Name)),
    invoiceNumber: textField(text(document?.ID)),
    currency: textField(currency),
    amountDue: textField(money(text(monetary?.GrandTotalAmount))),
    subtotal: textField(money(text(monetary?.LineTotalAmount))),
    tax: textField(money(text(monetary?.TaxTotalAmount))),
    issueDate: textField(ciiDate(document?.IssueDateTime)),
    dueDate: textField(ciiDate(settlement?.SpecifiedTradePaymentTerms)),
    iban: textField(text(account?.IBANID)?.replaceAll(/\s+/g, '')),
    bic: textField(text(institution?.BICID)?.replaceAll(/\s+/g, '')),
    paymentReference: textField(text(payment?.PaymentReference)),
  });
}

function readUbl(root: Record<string, unknown>): EinvoiceRead {
  const supplier = record(root.AccountingSupplierParty);
  const party = record(supplier?.Party);
  const name = record(party?.PartyName);
  const payment = record(root.PaymentMeans);
  const account = record(payment?.PayeeFinancialAccount);
  const branch = record(account?.FinancialInstitutionBranch);
  const legal = record(root.LegalMonetaryTotal);
  const taxTotal = record(root.TaxTotal);
  return compact({
    vendorName: textField(text(name?.Name)),
    invoiceNumber: textField(text(root.ID)),
    currency: textField(text(root.DocumentCurrencyCode)),
    amountDue: textField(money(text(legal?.PayableAmount))),
    subtotal: textField(money(text(legal?.TaxExclusiveAmount))),
    tax: textField(money(text(taxTotal?.TaxAmount))),
    issueDate: textField(text(root.IssueDate)),
    dueDate: textField(text(root.DueDate)),
    iban: textField(text(account?.ID)?.replaceAll(/\s+/g, '')),
    bic: textField(text(branch?.ID)?.replaceAll(/\s+/g, '')),
    paymentReference: textField(text(payment?.PaymentID)),
  });
}

function ciiDate(node: unknown): string | undefined {
  const recordNode = record(node);
  const date = record(recordNode?.DateTimeString) ?? record(record(recordNode?.DueDateDateTime)?.DateTimeString);
  const raw = text(date?.['#text']) ?? text(recordNode?.DateTimeString) ?? text(node);
  if (!raw) return undefined;
  const digits = raw.replaceAll(/\D/g, '');
  if (digits.length < 8) return undefined;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function textField(value: string | undefined): ExtractedField | undefined {
  if (!value) return undefined;
  return taken(value, 'xml');
}

function money(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalised = value.replaceAll(',', '').trim();
  return normalised.length > 0 ? normalised : undefined;
}

function compact(read: EinvoiceRead): EinvoiceRead {
  return Object.fromEntries(Object.entries(read).filter(([, value]) => value)) as EinvoiceRead;
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const node = record(value);
  if (!node) return undefined;
  return text(node['#text']);
}
