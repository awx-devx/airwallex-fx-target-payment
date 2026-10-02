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
  EXECUTING: { label: 'Executing', tone: 'orange', busy: true },
  IN_FLIGHT: { label: 'In flight', tone: 'info' },
  PAID: { label: 'Paid', tone: 'up' },
  FAILED: { label: 'Failed', tone: 'down' },
  CANCELLED: { label: 'Cancelled', tone: 'muted' },
};
