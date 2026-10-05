import type { FailureCategory, TransferStatus } from '@/contracts/airwallex';
import type { BillEventType } from '@/contracts/events';
import type { BillState } from '@/contracts/bill';
import type { TransitionEvent } from '@/server/domain/stateMachine';

/** SCHEDULED and OVERDUE share a rank. Approval statuses sit below both. */
const RANK: Partial<Record<TransferStatus, number>> = {
  SCHEDULED: 1,
  OVERDUE: 1,
  PROCESSING: 2,
  SENT: 3,
  PAID: 4,
};

export function transferRank(status: TransferStatus): number {
  return RANK[status] ?? 0;
}

export function isApprovalStatus(status: TransferStatus): boolean {
  return status === 'IN_APPROVAL' || status.startsWith('APPROVAL_');
}

/** A transfer can be cancelled until Airwallex marks it sent. */
export function canCancelTransfer(status: TransferStatus): boolean {
  return status !== 'SENT' && status !== 'PAID' && status !== 'FAILED' && status !== 'CANCELLED';
}

export interface StatusDecision {
  kind: 'ignore' | 'apply';
  /** Status stored on the execution. An overdue auto-cancel is stored as FAILED. */
  status?: TransferStatus;
  event?: TransitionEvent | null;
  audit?: BillEventType;
  deactivate?: boolean;
  failure?: { message: string; category: FailureCategory };
}

/**
 * Monotonic transfer update. Older `updated_at` values are ignored.
 * FAILED overrides PAID. CANCELLED never replaces FAILED, and it only
 * cancels the bill when we asked for it. An overdue transfer that Airwallex
 * auto-cancels becomes FAILED ("Not funded").
 */
export function decideTransferUpdate(input: {
  billState: BillState;
  storedStatus?: TransferStatus;
  storedUpdatedAt?: number;
  incomingStatus: TransferStatus;
  incomingUpdatedAt: number;
  cancelRequested: boolean;
}): StatusDecision {
  if (
    input.storedUpdatedAt !== undefined &&
    input.incomingUpdatedAt < input.storedUpdatedAt
  ) {
    return { kind: 'ignore' };
  }
  if (input.incomingStatus === 'CANCELLED') return decideCancel(input);
  if (
    input.storedStatus &&
    input.incomingStatus !== 'FAILED' &&
    transferRank(input.incomingStatus) < transferRank(input.storedStatus)
  ) {
    return { kind: 'ignore' };
  }
  if (input.incomingStatus === 'FAILED') return decideFailure(input, input.incomingStatus);
  if (input.incomingStatus === 'PAID') {
    if (input.billState === 'PAID') return statusOnly(input.incomingStatus);
    if (input.billState === 'IN_FLIGHT') {
      return apply(input.incomingStatus, 'PAID', 'PAID', false);
    }
    if (input.billState === 'EXECUTING') {
      return apply(input.incomingStatus, 'TRANSFER_CREATED', 'TRANSFER_CREATED', false);
    }
    return { kind: 'ignore' };
  }
  if (input.billState === 'EXECUTING') {
    return apply(input.incomingStatus, 'TRANSFER_CREATED', 'TRANSFER_CREATED', false);
  }
  if (input.billState === 'IN_FLIGHT') return statusOnly(input.incomingStatus);
  return { kind: 'ignore' };
}

function decideCancel(input: {
  billState: BillState;
  storedStatus?: TransferStatus;
  cancelRequested: boolean;
}): StatusDecision {
  if (input.billState === 'FAILED' || input.storedStatus === 'FAILED') {
    return { kind: 'ignore' };
  }
  if (input.storedStatus === 'OVERDUE') {
    return {
      ...decideFailure(
        { billState: input.billState, incomingStatus: 'FAILED' },
        'FAILED',
      ),
      failure: { message: 'Not funded', category: 'FUNDS_OR_LIMITS' },
    };
  }
  if (!input.cancelRequested || input.billState !== 'IN_FLIGHT') return { kind: 'ignore' };
  return apply('CANCELLED', 'CANCEL_TRANSFER', 'CANCELLED', true);
}

function decideFailure(
  input: { billState: BillState; incomingStatus: TransferStatus },
  status: TransferStatus,
): StatusDecision {
  if (input.billState === 'PAID') return apply(status, 'LATE_FAILURE', 'FAILED', true);
  if (input.billState === 'IN_FLIGHT') return apply(status, 'PAYOUT_FAILED', 'FAILED', true);
  if (input.billState === 'EXECUTING') return apply(status, 'CREATE_FAILED', 'FAILED', true);
  if (input.billState === 'FAILED') return statusOnly(status);
  return { kind: 'ignore' };
}

function apply(
  status: TransferStatus,
  event: TransitionEvent,
  audit: BillEventType,
  deactivate: boolean,
): StatusDecision {
  return { kind: 'apply', status, event, audit, deactivate };
}

function statusOnly(status: TransferStatus): StatusDecision {
  return { kind: 'apply', status, event: null, audit: 'TRANSFER_STATUS', deactivate: false };
}
