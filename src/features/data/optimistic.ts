import type { PutStrategyBody } from '@/contracts/api';
import type { BillSummary } from '@/contracts/bill';
import { allowedActions } from '@/contracts/permissions';

function demoOptions(bill: BillSummary) {
  return {
    demoMode: bill.allowedActions.some((action) =>
      action === 'SIMULATE' || action === 'STOP_SIMULATION' || action === 'ADVANCE_TRANSFER',
    ),
    simulationRunning: bill.allowedActions.includes('STOP_SIMULATION'),
  };
}

export function billWithState(bill: BillSummary, state: BillSummary['state']): BillSummary {
  const next = { ...bill, state };
  return { ...next, allowedActions: allowedActions(next, demoOptions(bill)) };
}

export function billWithStrategy(bill: BillSummary, body: PutStrategyBody): BillSummary {
  return {
    ...bill,
    strategyMode: body.mode,
    ...(body.targetPrice ? { targetPrice: body.targetPrice } : {}),
    ...(body.maxCost ? { maxCost: body.maxCost } : {}),
  };
}
