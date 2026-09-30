import { z } from 'zod';
import { decimalStringSchema, isoDateTimeSchema, quoteSummarySchema } from '@/contracts/airwallex';

export const APPROVAL_KINDS = ['TARGET_HIT', 'DEADLINE'] as const;
export const approvalKindSchema = z.enum(APPROVAL_KINDS);
export type ApprovalKind = z.infer<typeof approvalKindSchema>;

export const APPROVAL_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'SUPERSEDED',
] as const;
export const approvalStatusSchema = z.enum(APPROVAL_STATUSES);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const approvalSummarySchema = z.object({
  id: z.string().min(1),
  kind: approvalKindSchema,
  status: approvalStatusSchema,
  quote: quoteSummarySchema,
  expiresAt: isoDateTimeSchema,
  autosettleAt: isoDateTimeSchema.optional(),
  trigger: z
    .object({
      price: decimalStringSchema,
      simulated: z.boolean(),
    })
    .optional(),
  autoApproved: z.boolean().optional(),
});
export type ApprovalSummary = z.infer<typeof approvalSummarySchema>;
