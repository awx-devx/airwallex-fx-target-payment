import type { FailureCategory, TransferStatus } from '@/contracts/airwallex';
import { D, decimalString } from '@/contracts/money';
import { FAILURE_NEXT_STEP } from '@/contracts/airwallex-errors';

export type DistanceBand = 'far' | 'mid' | 'near' | 'through';

/** How far canonical `price` is from `target`. At or below target is through. */
export function distanceToTarget(
  price: string,
  target: string,
): { band: DistanceBand; ratio: string } {
  const delta = D(price).minus(D(target));
  const ratio = delta.div(D(target));
  const text = decimalString(ratio);
  if (!delta.greaterThan(0)) return { band: 'through', ratio: text };
  const abs = ratio.abs();
  if (abs.greaterThan('0.01')) return { band: 'far', ratio: text };
  if (abs.lessThan('0.0025')) return { band: 'near', ratio: text };
  return { band: 'mid', ratio: text };
}

export type CountdownUrgency = 'normal' | 'warn' | 'urgent' | 'expired';

export function countdownUrgency(totalSeconds: number): CountdownUrgency {
  if (totalSeconds <= 0) return 'expired';
  if (totalSeconds < 60) return 'urgent';
  if (totalSeconds < 5 * 60) return 'warn';
  return 'normal';
}

export function secondsBetween(now: string, until: string): number {
  const delta = Date.parse(until) - Date.parse(now);
  if (!Number.isFinite(delta)) return 0;
  return Math.floor(delta / 1000);
}

const APPROVAL: ReadonlySet<TransferStatus> = new Set([
  'IN_APPROVAL',
  'APPROVAL_RECALLED',
  'APPROVAL_REJECTED',
  'APPROVAL_BLOCKED',
]);

const CATEGORY_LABEL: Record<FailureCategory, string> = {
  BENEFICIARY_DETAILS: 'beneficiary details',
  ACCOUNT: 'account',
  RETURNED: 'returned',
  FUNDS_OR_LIMITS: 'funds or limits',
  COMPLIANCE: 'compliance',
  CLIENT: 'client',
  SYSTEM: 'system',
};

export function transferStatusLabel(
  status: TransferStatus,
  options?: { lateFailure?: boolean; category?: FailureCategory },
): string {
  if (options?.lateFailure) return 'Failed after paid';
  if (APPROVAL.has(status)) return 'Awaiting Airwallex approval';
  if (status === 'FAILED') {
    return options?.category
      ? `Failed · ${CATEGORY_LABEL[options.category]}`
      : 'Failed';
  }
  const labels: Record<TransferStatus, string> = {
    IN_APPROVAL: 'Awaiting Airwallex approval',
    APPROVAL_RECALLED: 'Awaiting Airwallex approval',
    APPROVAL_REJECTED: 'Awaiting Airwallex approval',
    APPROVAL_BLOCKED: 'Awaiting Airwallex approval',
    SCHEDULED: 'Scheduled',
    OVERDUE: 'Overdue',
    PROCESSING: 'Processing',
    SENT: 'Sent',
    PAID: 'Paid',
    FAILED: 'Failed',
    CANCELLED: 'Cancelled',
  };
  return labels[status];
}

export function transferNextStep(category: FailureCategory): string {
  return FAILURE_NEXT_STEP[category];
}

export const TRANSFER_STEPS = ['SCHEDULED', 'PROCESSING', 'SENT', 'PAID'] as const;

export function transferStepIndex(status: TransferStatus): number {
  if (status === 'OVERDUE') return 0;
  return TRANSFER_STEPS.indexOf(status as (typeof TRANSFER_STEPS)[number]);
}
