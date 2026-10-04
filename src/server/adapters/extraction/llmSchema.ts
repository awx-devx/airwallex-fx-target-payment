import { extractedBillSchema, type ExtractedBill } from '@/contracts/extraction';

/**
 * What the model is allowed to return. Boxes are located later from the text layer.
 * Anthropic structured outputs reject `minimum` on integers, so page is unconstrained.
 */
export const LLM_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'documentType',
    'vendorName',
    'vendorCountry',
    'invoiceNumber',
    'currency',
    'amountDue',
    'issueDate',
    'dueDate',
    'bank',
  ],
  properties: {
    documentType: {
      type: 'string',
      enum: ['invoice', 'credit_note', 'receipt', 'statement', 'quote', 'other'],
    },
    vendorName: { $ref: '#/$defs/field' },
    vendorCountry: { $ref: '#/$defs/field' },
    invoiceNumber: { $ref: '#/$defs/field' },
    currency: { $ref: '#/$defs/field' },
    amountDue: { $ref: '#/$defs/field' },
    subtotal: { $ref: '#/$defs/field' },
    tax: { $ref: '#/$defs/field' },
    issueDate: { $ref: '#/$defs/field' },
    dueDate: { $ref: '#/$defs/field' },
    paymentReference: { $ref: '#/$defs/field' },
    bank: {
      type: 'object',
      additionalProperties: false,
      properties: {
        accountName: { $ref: '#/$defs/field' },
        iban: { $ref: '#/$defs/field' },
        bic: { $ref: '#/$defs/field' },
        accountNumber: { $ref: '#/$defs/field' },
        localBankCode: { $ref: '#/$defs/field' },
        bankCountry: { $ref: '#/$defs/field' },
      },
    },
  },
  $defs: {
    field: {
      type: 'object',
      additionalProperties: false,
      required: ['value', 'confidence'],
      properties: {
        value: { type: ['string', 'null'] },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        reason: { type: ['string', 'null'] },
        evidence: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['page', 'text'],
          properties: {
            page: { type: 'integer' },
            text: { type: 'string' },
          },
        },
      },
    },
  },
} as const;

export function parseLlmBill(payload: unknown, meta: ExtractedBill['meta']): ExtractedBill {
  const record = asRecord(payload);
  return extractedBillSchema.parse({
    documentType: record.documentType,
    vendorName: llmField(record.vendorName),
    vendorCountry: llmField(record.vendorCountry),
    invoiceNumber: llmField(record.invoiceNumber),
    currency: llmField(record.currency),
    amountDue: llmField(record.amountDue),
    subtotal: presentField(record.subtotal),
    tax: presentField(record.tax),
    issueDate: llmField(record.issueDate),
    dueDate: llmField(record.dueDate),
    paymentReference: presentField(record.paymentReference),
    bank: llmBank(record.bank),
    warnings: [],
    meta,
  });
}

function llmBank(value: unknown): ExtractedBill['bank'] {
  const bank = asRecord(value);
  return {
    ...(presentField(bank.accountName) ? { accountName: llmField(bank.accountName) } : {}),
    ...(presentField(bank.iban) ? { iban: llmField(bank.iban) } : {}),
    ...(presentField(bank.bic) ? { bic: llmField(bank.bic) } : {}),
    ...(presentField(bank.accountNumber) ? { accountNumber: llmField(bank.accountNumber) } : {}),
    ...(presentField(bank.localBankCode) ? { localBankCode: llmField(bank.localBankCode) } : {}),
    ...(presentField(bank.bankCountry) ? { bankCountry: llmField(bank.bankCountry) } : {}),
  };
}

function presentField(value: unknown): unknown {
  const record = asRecord(value);
  if (typeof record.value !== 'string' || record.value.length === 0) return undefined;
  return llmField(value);
}

function llmField(value: unknown): {
  value: string | null;
  confidence: 'high' | 'medium' | 'low';
  source: 'llm';
  reasons?: string[];
  evidence?: { page: number; text: string };
} {
  const field = asRecord(value);
  const confidence = field.confidence === 'high' || field.confidence === 'medium' ? field.confidence : 'low';
  const evidence = asRecord(field.evidence);
  const page = typeof evidence.page === 'number' ? evidence.page : undefined;
  const text = typeof evidence.text === 'string' ? evidence.text : undefined;
  const reason = typeof field.reason === 'string' && field.reason.length > 0 ? field.reason : undefined;
  return {
    value: typeof field.value === 'string' && field.value.length > 0 ? field.value : null,
    confidence,
    source: 'llm',
    ...(reason ? { reasons: [reason] } : {}),
    ...(page && text ? { evidence: { page, text } } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
