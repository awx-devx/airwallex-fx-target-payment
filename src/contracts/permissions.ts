import type { TransferStatus } from '@/contracts/airwallex';
import type { BillAction, BillState, BillSummary } from '@/contracts/bill';
import { BILL_ACTIONS } from '@/contracts/bill';

export interface PermissionOptions {
  /**
   * DEMO-ONLY: exposes SIMULATE, STOP_SIMULATION and ADVANCE_TRANSFER.
   * PROD: those actions are not offered; triggers come from real ticks and
   * transfer status comes from webhooks.
   */
  demoMode?: boolean;
  simulationRunning?: boolean;
}

/**
 * Actions the ticket may render.
 * The server and the mock data source both call this before changing state.
 */
export function allowedActions(
  bill: Pick<BillSummary, 'state' | 'flags' | 'beneficiary'> & {
    execution?: { status: TransferStatus };
  },
  options?: PermissionOptions,
): BillAction[] {
  const actions = new Set<BillAction>(actionsForState(bill));
  if (options?.demoMode) {
    for (const action of demoActions(bill.state, options.simulationRunning === true)) {
      actions.add(action);
    }
  }
  return BILL_ACTIONS.filter((action) => actions.has(action));
}

function actionsForState(
  bill: Pick<BillSummary, 'state' | 'beneficiary'> & {
    execution?: { status: TransferStatus };
  },
): BillAction[] {
  const blockedAccount = bill.beneficiary?.verification?.code === 'INVALID';
  switch (bill.state) {
    case 'DRAFT':
      return ['REVIEW', 'EDIT', 'RESOLVE_BENEFICIARY', 'CANCEL'];
    case 'READY':
      return [
        'EDIT',
        'RESOLVE_BENEFICIARY',
        'EDIT_STRATEGY',
        ...(blockedAccount || !bill.beneficiary ? [] : (['ARM'] as const)),
        'CANCEL',
      ];
    case 'WATCHING':
      return ['EDIT_STRATEGY', 'PAUSE', 'PAY_NOW', 'CANCEL'];
    case 'PAUSED':
      return ['EDIT_STRATEGY', 'RESUME', 'CANCEL'];
    case 'FAILED':
      return ['EDIT', 'RESOLVE_BENEFICIARY', 'REARM'];
    case 'EXECUTING':
    case 'PAID':
    case 'CANCELLED':
      return [];
    case 'IN_FLIGHT':
      return bill.execution && canCancel(bill.execution.status) ? ['CANCEL'] : [];
    default: {
      const never: never = bill.state;
      return never;
    }
  }
}

function canCancel(status: TransferStatus): boolean {
  return status !== 'SENT' && status !== 'PAID' && status !== 'FAILED' && status !== 'CANCELLED';
}

function demoActions(state: BillState, simulationRunning: boolean): BillAction[] {
  const actions: BillAction[] = [];
  if (simulationRunning) actions.push('STOP_SIMULATION');
  else if (state === 'WATCHING') actions.push('SIMULATE');
  if (state === 'IN_FLIGHT') actions.push('ADVANCE_TRANSFER');
  return actions;
}
