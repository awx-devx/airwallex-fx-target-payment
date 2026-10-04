import type { BillState } from '@/contracts/bill';

export class InvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStateError';
  }
}

export const TRANSITION_EVENTS = [
  'REVIEW',
  'ARM',
  'ARM_PAST_DEADLINE',
  'PAUSE',
  'RESUME',
  'TRIGGER',
  'DEADLINE',
  'TRANSFER_CREATED',
  'CREATE_FAILED',
  'PAID',
  'PAYOUT_FAILED',
  'REARM',
  'CANCEL',
  'SET_STRATEGY',
] as const;
export type TransitionEvent = (typeof TRANSITION_EVENTS)[number];

const EXECUTING_FROM = ['WATCHING', 'PAUSED'] as const satisfies readonly BillState[];

interface Rule {
  from: readonly BillState[];
  to: BillState | 'SAME';
}

const TABLE: Record<TransitionEvent, Rule> = {
  REVIEW: { from: ['DRAFT'], to: 'READY' },
  ARM: { from: ['READY'], to: 'WATCHING' },
  ARM_PAST_DEADLINE: { from: ['READY'], to: 'EXECUTING' },
  PAUSE: { from: ['WATCHING'], to: 'PAUSED' },
  RESUME: { from: ['PAUSED'], to: 'WATCHING' },
  TRIGGER: { from: ['WATCHING'], to: 'EXECUTING' },
  DEADLINE: { from: EXECUTING_FROM, to: 'EXECUTING' },
  TRANSFER_CREATED: { from: ['EXECUTING'], to: 'IN_FLIGHT' },
  CREATE_FAILED: { from: ['EXECUTING'], to: 'FAILED' },
  PAID: { from: ['IN_FLIGHT'], to: 'PAID' },
  PAYOUT_FAILED: { from: ['IN_FLIGHT'], to: 'FAILED' },
  REARM: { from: ['FAILED'], to: 'READY' },
  CANCEL: { from: ['DRAFT', 'READY', 'WATCHING', 'PAUSED'], to: 'CANCELLED' },
  SET_STRATEGY: { from: ['READY', 'WATCHING', 'PAUSED'], to: 'SAME' },
};

export function transition(
  state: BillState,
  event: TransitionEvent,
): { to: BillState; allowedFrom: readonly BillState[] } {
  const rule = TABLE[event];
  if (!rule.from.includes(state)) {
    throw new InvalidStateError(`${state} cannot ${event}`);
  }
  return {
    to: rule.to === 'SAME' ? state : rule.to,
    allowedFrom: rule.from,
  };
}

/**
 * The execution-create claim. The transaction moves a watching or paused
 * bill to EXECUTING. A deadline that has already passed is `ARM_PAST_DEADLINE`
 * and does not go through this claim.
 */
export function claimExecutionCreate(state: BillState): {
  to: 'EXECUTING';
  allowedFrom: typeof EXECUTING_FROM;
} {
  transition(state, 'DEADLINE');
  return { to: 'EXECUTING', allowedFrom: EXECUTING_FROM };
}
