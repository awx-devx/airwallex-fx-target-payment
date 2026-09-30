import { z } from 'zod';
import {
  beneficiarySummarySchema,
  currencyCodeSchema,
  decimalStringSchema,
  executionSummarySchema,
  isoDateSchema,
  isoDateTimeSchema,
  transferMethodSchema,
  transferReasonSchema,
} from '@/contracts/airwallex';
import { approvalSummarySchema } from '@/contracts/approval';

export const BILL_STATES = [
  'DRAFT',
  'READY',
  'WATCHING',
  'PAUSED',
  'TARGET_HIT',
  'DEADLINE_WINDOW',
  'AUTO_SETTLING',
  'APPROVED',
  'EXECUTING',
  'IN_FLIGHT',
  'PAID',
  'FAILED',
  'CANCELLED',
] as const;
export const billStateSchema = z.enum(BILL_STATES);
export type BillState = z.infer<typeof billStateSchema>;

export const BILL_ACTIONS = [
  'REVIEW',
  'EDIT',
  'RESOLVE_BENEFICIARY',
  'ARM',
  'EDIT_STRATEGY',
  'PAUSE',
  'RESUME',
  'PAY_NOW',
  'APPROVE',
  'HOLD',
  'CANCEL',
  'REARM',
  'ADVANCE_TRANSFER',
  'SIMULATE',
  'STOP_SIMULATION',
] as const;
export const billActionSchema = z.enum(BILL_ACTIONS);
export type BillAction = z.infer<typeof billActionSchema>;

export const STRATEGY_MODES = ['TARGET_RATE', 'MAX_COST'] as const;
export const strategyModeSchema = z.enum(STRATEGY_MODES);
export type StrategyMode = z.infer<typeof strategyModeSchema>;

export const pairSchema = z.object({
  base: currencyCodeSchema,
  quote: currencyCodeSchema,
});
export type Pair = z.infer<typeof pairSchema>;

export const billFlagsSchema = z.object({
  stale: z.boolean().optional(),
  insufficientBalance: z.boolean().optional(),
  noReferenceHistory: z.boolean().optional(),
  overdue: z.boolean().optional(),
  awxApproval: z.boolean().optional(),
  amountLimit: z.boolean().optional(),
  routeUnsupported: z.boolean().optional(),
  nameMismatch: z.boolean().optional(),
});
export type BillFlags = z.infer<typeof billFlagsSchema>;

export const billSummarySchema = z.object({
  id: z.string().min(1),
  state: billStateSchema,
  vendorName: z.string().min(1),
  invoiceNumber: z.string().min(1),
  pair: pairSchema,
  amount: decimalStringSchema,
  dueDate: isoDateSchema,
  executionDeadline: isoDateSchema,
  entryPrice: decimalStringSchema.optional(),
  targetPrice: decimalStringSchema.optional(),
  maxCost: decimalStringSchema.optional(),
  strategyMode: strategyModeSchema.optional(),
  lastPrice: decimalStringSchema.optional(),
  lastTickAt: isoDateTimeSchema.optional(),
  savings: decimalStringSchema.optional(),
  savingsPct: decimalStringSchema.optional(),
  distanceToTargetBps: z.number().optional(),
  estCost: decimalStringSchema.optional(),
  transferMethod: transferMethodSchema,
  transferReason: transferReasonSchema,
  reference: z.string().min(1),
  beneficiary: beneficiarySummarySchema.optional(),
  activeApproval: approvalSummarySchema.optional(),
  execution: executionSummarySchema.optional(),
  flags: billFlagsSchema,
  allowedActions: z.array(billActionSchema),
});
export type BillSummary = z.infer<typeof billSummarySchema>;

export const ROLES = ['preparer', 'approver'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;
