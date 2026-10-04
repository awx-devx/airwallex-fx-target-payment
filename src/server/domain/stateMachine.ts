import type { BillState } from '@/contracts/bill';

export class InvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStateError';
  }
}

/** States that may move to EXECUTING when an execution document is created. */
export const EXECUTION_CREATE_FROM = [
  'WATCHING',
  'PAUSED',
] as const satisfies readonly BillState[];

/**
 * The execution-create claim. B3.2 replaces this with the full transition table.
 */
export function claimExecutionCreate(state: BillState): {
  to: 'EXECUTING';
  allowedFrom: typeof EXECUTION_CREATE_FROM;
} {
  if (state !== 'WATCHING' && state !== 'PAUSED') {
    throw new InvalidStateError(`bill in ${state} cannot start execution`);
  }
  return { to: 'EXECUTING', allowedFrom: EXECUTION_CREATE_FROM };
}
