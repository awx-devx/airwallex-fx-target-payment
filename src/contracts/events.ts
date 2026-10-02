import { z } from 'zod';
import { isoDateTimeSchema } from '@/contracts/airwallex';

export const BILL_EVENT_TYPES = [
  'ARMED',
  'TICK_CROSSED',
  'QUOTE_LOCKED',
  'NEAR_MISS',
  'QUOTE_EXPIRED',
  'AUTOSETTLE',
  'CANCELLED',
  'TRANSFER_CREATED',
  'TRANSFER_STATUS',
  'PAID',
  'FAILED',
  'STRATEGY_UPDATED',
  'PAUSED',
  'RESUMED',
  'CATCH_UP',
  'SIM_STARTED',
  'SIM_ENDED',
] as const;
export const billEventTypeSchema = z.enum(BILL_EVENT_TYPES);
export type BillEventType = z.infer<typeof billEventTypeSchema>;

export const billEventSchema = z.object({
  id: z.string().min(1),
  billId: z.string().min(1),
  ts: isoDateTimeSchema,
  type: billEventTypeSchema,
  actor: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type BillEvent = z.infer<typeof billEventSchema>;
