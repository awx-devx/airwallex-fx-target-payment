import { z } from 'zod';
import {
  decimalStringSchema,
  executionSummarySchema,
  isoDateTimeSchema,
} from '@/contracts/airwallex';
import { billSummarySchema, pairSchema } from '@/contracts/bill';
import { extractionStageSchema, extractionStatusSchema } from '@/contracts/extraction';

export const RATE_SOURCES = ['AIRWALLEX', 'SIMULATED', 'REFERENCE'] as const;
export const rateSourceSchema = z.enum(RATE_SOURCES);
export type RateSourceKind = z.infer<typeof rateSourceSchema>;

export const SIM_PHASES = [
  'RAMPING',
  'TRIGGERED',
  'EXECUTING',
  'SETTLING',
  'DONE',
  'ABORTED',
] as const;
export const simPhaseSchema = z.enum(SIM_PHASES);
export type SimPhase = z.infer<typeof simPhaseSchema>;

export const NOTIFICATION_LEVELS = ['info', 'success', 'warn', 'danger'] as const;

export const notificationSchema = z.object({
  id: z.string().min(1),
  billId: z.string().optional(),
  title: z.string().min(1),
  body: z.string(),
  level: z.enum(NOTIFICATION_LEVELS),
  createdAt: isoDateTimeSchema,
  href: z.string().optional(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const appEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tick'),
    pair: pairSchema,
    billId: z.string().optional(),
    ts: isoDateTimeSchema,
    price: decimalStringSchema,
    source: rateSourceSchema,
  }),
  z.object({
    type: z.literal('bill.updated'),
    bill: billSummarySchema,
  }),
  z.object({
    type: z.literal('execution.updated'),
    execution: executionSummarySchema,
    billId: z.string().min(1),
  }),
  z.object({
    type: z.literal('notification'),
    notification: notificationSchema,
  }),
  z.object({
    type: z.literal('clock'),
    now: isoDateTimeSchema,
    warp: z.object({ speed: z.number().positive() }),
  }),
  z.object({
    type: z.literal('demo.sim'),
    billId: z.string().min(1),
    simId: z.string().min(1),
    phase: simPhaseSchema,
    etaSec: z.number().optional(),
  }),
  z.object({
    type: z.literal('extraction.progress'),
    billId: z.string().min(1),
    documentId: z.string().min(1),
    filename: z.string().min(1),
    stage: extractionStageSchema,
    status: extractionStatusSchema,
  }),
]);
export type AppEvent = z.infer<typeof appEventSchema>;
