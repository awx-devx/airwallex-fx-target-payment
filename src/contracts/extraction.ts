import { z } from 'zod';

/** Per-field extraction result. Shape from docs/12 §3. */

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export const confidenceSchema = z.enum(CONFIDENCE_LEVELS);
export type Confidence = z.infer<typeof confidenceSchema>;

export const FIELD_SOURCES = ['xml', 'qr', 'llm', 'user'] as const;
export const fieldSourceSchema = z.enum(FIELD_SOURCES);
export type FieldSource = z.infer<typeof fieldSourceSchema>;

export const DOCUMENT_TYPES = [
  'invoice',
  'credit_note',
  'receipt',
  'statement',
  'quote',
  'other',
] as const;
export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const EXTRACTOR_KINDS = ['anthropic', 'ollama', 'mock'] as const;
export const extractorKindSchema = z.enum(EXTRACTOR_KINDS);
export type ExtractorKind = z.infer<typeof extractorKindSchema>;

export const EXTRACTION_WARNINGS = [
  'DUPLICATE',
  'NOT_INVOICE',
  'HOME_CURRENCY',
  'OVERDUE',
  'CONFLICT',
  'UNREADABLE',
] as const;
export const extractionWarningSchema = z.object({
  code: z.enum(EXTRACTION_WARNINGS),
  message: z.string().min(1),
});
export type ExtractionWarning = z.infer<typeof extractionWarningSchema>;

export const evidenceSchema = z.object({
  page: z.number().int().positive(),
  text: z.string(),
});

export const highlightBoxSchema = z.object({
  page: z.number().int().positive(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type HighlightBox = z.infer<typeof highlightBoxSchema>;

export const extractedFieldSchema = z.object({
  value: z.string().nullable(),
  confidence: confidenceSchema,
  source: fieldSourceSchema,
  reasons: z.array(z.string()).optional(),
  evidence: evidenceSchema.optional(),
  boxes: z.array(highlightBoxSchema).optional(),
});
export type ExtractedField = z.infer<typeof extractedFieldSchema>;

export const extractedBankSchema = z.object({
  accountName: extractedFieldSchema.optional(),
  iban: extractedFieldSchema.optional(),
  bic: extractedFieldSchema.optional(),
  accountNumber: extractedFieldSchema.optional(),
  localBankCode: extractedFieldSchema.optional(),
  bankCountry: extractedFieldSchema.optional(),
});
export type ExtractedBank = z.infer<typeof extractedBankSchema>;

export const extractionMetaSchema = z.object({
  extractor: extractorKindSchema,
  model: z.string().optional(),
  promptVersion: z.string().min(1),
  escalated: z.boolean(),
  pages: z.number().int().nonnegative(),
  textLayer: z.boolean(),
  ms: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
});

export const extractedBillSchema = z.object({
  documentType: documentTypeSchema,
  vendorName: extractedFieldSchema,
  vendorCountry: extractedFieldSchema,
  invoiceNumber: extractedFieldSchema,
  currency: extractedFieldSchema,
  amountDue: extractedFieldSchema,
  subtotal: extractedFieldSchema.optional(),
  tax: extractedFieldSchema.optional(),
  issueDate: extractedFieldSchema,
  dueDate: extractedFieldSchema,
  paymentReference: extractedFieldSchema.optional(),
  bank: extractedBankSchema,
  warnings: z.array(extractionWarningSchema),
  meta: extractionMetaSchema,
});
export type ExtractedBill = z.infer<typeof extractedBillSchema>;

export const EXTRACTION_STATUSES = ['PENDING', 'RUNNING', 'DONE', 'FAILED'] as const;
export const extractionStatusSchema = z.enum(EXTRACTION_STATUSES);
export type ExtractionStatus = z.infer<typeof extractionStatusSchema>;

export const EXTRACTION_STAGES = ['working', 'searching', 'solving'] as const;
export const extractionStageSchema = z.enum(EXTRACTION_STAGES);
export type ExtractionStage = z.infer<typeof extractionStageSchema>;
