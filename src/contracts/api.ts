import { z } from 'zod';
import {
  decimalStringSchema,
  currencyCodeSchema,
  entityTypeSchema,
  fieldErrorSchema,
  isoDateSchema,
  quoteValiditySchema,
  transferMethodSchema,
  transferReasonSchema,
} from '@/contracts/airwallex';
import { billSummarySchema, strategyModeSchema } from '@/contracts/bill';
import { chartRangeSchema } from '@/contracts/chart';
import { billEventSchema } from '@/contracts/events';
import { extractedBillSchema, extractionStatusSchema } from '@/contracts/extraction';

export const billDocumentSchema = z.object({
  id: z.string().min(1),
  filename: z.string().min(1),
  mime: z.string().min(1),
  size: z.number().int().nonnegative(),
  sha256: z.string().min(1),
  extraction: z
    .object({
      status: extractionStatusSchema,
      result: extractedBillSchema.optional(),
      error: z.string().optional(),
    })
    .optional(),
});
export type BillDocument = z.infer<typeof billDocumentSchema>;

export const strategyDetailSchema = z.object({
  mode: strategyModeSchema,
  targetPrice: decimalStringSchema,
  maxCost: decimalStringSchema.optional(),
  feeEstimate: decimalStringSchema,
  bufferBps: z.number(),
  confirmTicks: z.number().int(),
  quoteValidityTarget: quoteValiditySchema,
  quoteValidityDeadline: quoteValiditySchema,
  autosettleCutoff: z.string().regex(/^\d{2}:\d{2}$/),
});
export type StrategyDetail = z.infer<typeof strategyDetailSchema>;

export const billDetailSchema = billSummarySchema.extend({
  documents: z.array(billDocumentSchema),
  strategy: strategyDetailSchema.optional(),
  events: z.array(billEventSchema),
});
export type BillDetail = z.infer<typeof billDetailSchema>;

export const listBillsQuerySchema = z.object({
  state: billSummarySchema.shape.state.optional(),
  base: z.string().optional(),
  quote: z.string().optional(),
});
export type ListBillsQuery = z.infer<typeof listBillsQuerySchema>;

export const patchBillBodySchema = z.object({
  vendorName: z.string().min(1).optional(),
  invoiceNumber: z.string().min(1).optional(),
  amount: decimalStringSchema.optional(),
  dueDate: isoDateSchema.optional(),
  reference: z.string().min(1).optional(),
  transferReason: transferReasonSchema.optional(),
  transferMethod: transferMethodSchema.optional(),
  /** DRAFT only. The bank account currency follows this. */
  billCurrency: currencyCodeSchema.optional(),
});
export type PatchBillBody = z.infer<typeof patchBillBodySchema>;

export const putStrategyBodySchema = z.object({
  mode: strategyModeSchema,
  targetPrice: decimalStringSchema.optional(),
  maxCost: decimalStringSchema.optional(),
  bufferBps: z.number().optional(),
  confirmTicks: z.number().int().positive().optional(),
  quoteValidityTarget: quoteValiditySchema.optional(),
  quoteValidityDeadline: quoteValiditySchema.optional(),
  autosettleCutoff: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});
export type PutStrategyBody = z.infer<typeof putStrategyBodySchema>;

export const armBodySchema = z.object({
  standingInstruction: z.literal(true),
  transferMethod: transferMethodSchema,
  transferReason: transferReasonSchema,
  reference: z.string().min(1),
});
export type ArmBody = z.infer<typeof armBodySchema>;

export const chartQuerySchema = z.object({
  range: chartRangeSchema,
});
export type ChartQuery = z.infer<typeof chartQuerySchema>;

export const beneficiarySchemaBodySchema = z.object({
  bankCountry: z.string().length(2),
  accountCurrency: z.string().length(3),
  transferMethod: transferMethodSchema,
  entityType: entityTypeSchema,
});
export type BeneficiarySchemaBody = z.infer<typeof beneficiarySchemaBodySchema>;

export const validateTransferResponseSchema = z.object({
  fieldErrors: z.array(fieldErrorSchema),
});

export const resolveBeneficiaryBodySchema = z.object({
  name: z.string().min(1),
  entityType: entityTypeSchema,
  bankCountry: z.string().length(2),
  accountCurrency: currencyCodeSchema,
  transferMethod: transferMethodSchema,
  iban: z.string().min(1).optional(),
  accountNumber: z.string().min(1).optional(),
  bic: z.string().min(1).optional(),
  localBankCode: z.string().min(1).optional(),
  routingType: z.string().min(1).optional(),
});
export type ResolveBeneficiaryBody = z.infer<typeof resolveBeneficiaryBodySchema>;

export const quotaQuerySchema = z.object({
  type: z.enum(['ID_OUTBOUND', 'VN_OUTBOUND']),
});
