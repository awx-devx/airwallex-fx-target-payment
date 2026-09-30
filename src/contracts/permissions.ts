import type { BillAction, BillState, BillSummary, Role } from '@/contracts/bill';
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

const APPROVER_ONLY = new Set<BillAction>(['APPROVE', 'HOLD']);

/**
 * Actions the ticket may render. `APPROVE` and `HOLD` require the approver role.
 * The server and the mock data source both call this before changing state.
 */
export function allowedActions(
  bill: Pick<BillSummary, 'state' | 'flags' | 'beneficiary'>,
  role: Role,
  options?: PermissionOptions,
): BillAction[] {
  const actions = new Set<BillAction>(actionsForState(bill));
  if (options?.demoMode) {
    for (const action of demoActions(bill.state, options.simulationRunning === true)) {
      actions.add(action);
    }
  }
  if (role !== 'approver') {
    for (const action of APPROVER_ONLY) actions.delete(action);
  }
  return BILL_ACTIONS.filter((action) => actions.has(action));
}

function actionsForState(
  bill: Pick<BillSummary, 'state' | 'beneficiary'>,
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
    case 'TARGET_HIT':
      return ['APPROVE', 'HOLD', 'CANCEL'];
    case 'DEADLINE_WINDOW':
      return ['APPROVE', 'CANCEL'];
    case 'FAILED':
      return ['EDIT', 'RESOLVE_BENEFICIARY', 'REARM'];
    case 'AUTO_SETTLING':
    case 'APPROVED':
    case 'EXECUTING':
    case 'IN_FLIGHT':
    case 'PAID':
    case 'CANCELLED':
      return [];
    default: {
      const never: never = bill.state;
      return never;
    }
  }
}

function demoActions(state: BillState, simulationRunning: boolean): BillAction[] {
  const actions: BillAction[] = [];
  if (simulationRunning) actions.push('STOP_SIMULATION');
  else if (state === 'WATCHING') actions.push('SIMULATE');
  if (state === 'IN_FLIGHT') actions.push('ADVANCE_TRANSFER');
  return actions;
}
