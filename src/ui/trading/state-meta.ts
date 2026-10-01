import type { BillState } from '@/contracts/bill';
import type { BadgeTone } from '@/ui/primitives/badge';

export interface StateMeta {
  label: string;
  tone: BadgeTone;
  pulse?: boolean | 'strong';
  busy?: boolean;
}

/** Single source for bill-state label and colour. */
export const STATE_META: Record<BillState, StateMeta> = {
  DRAFT: { label: 'Draft', tone: 'muted' },
  READY: { label: 'Ready', tone: 'neutral' },
  WATCHING: { label: 'Watching', tone: 'orange', pulse: true },
  PAUSED: { label: 'Paused', tone: 'muted' },
  TARGET_HIT: { label: 'Target hit', tone: 'up', pulse: 'strong' },
  DEADLINE_WINDOW: { label: 'Final day', tone: 'warn', pulse: true },
  AUTO_SETTLING: { label: 'Auto-settling', tone: 'warn' },
  APPROVED: { label: 'Approved', tone: 'neutral' },
  EXECUTING: { label: 'Executing', tone: 'orange', busy: true },
  IN_FLIGHT: { label: 'In flight', tone: 'info' },
  PAID: { label: 'Paid', tone: 'up' },
  FAILED: { label: 'Failed', tone: 'down' },
  CANCELLED: { label: 'Cancelled', tone: 'muted' },
};
