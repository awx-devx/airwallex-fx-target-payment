import { BILL_STATES, type BillState } from '@/contracts/bill';
import {
  InvalidStateError,
  TRANSITION_EVENTS,
  claimExecutionCreate,
  transition,
  type TransitionEvent,
} from '@/server/domain/stateMachine';
import { describe, expect, it } from 'vitest';

const LEGAL: Array<[BillState, TransitionEvent, BillState]> = [
  ['DRAFT', 'REVIEW', 'READY'],
  ['READY', 'ARM', 'WATCHING'],
  ['READY', 'ARM_PAST_DEADLINE', 'EXECUTING'],
  ['WATCHING', 'PAUSE', 'PAUSED'],
  ['PAUSED', 'RESUME', 'WATCHING'],
  ['WATCHING', 'TRIGGER', 'EXECUTING'],
  ['WATCHING', 'DEADLINE', 'EXECUTING'],
  ['PAUSED', 'DEADLINE', 'EXECUTING'],
  ['EXECUTING', 'TRANSFER_CREATED', 'IN_FLIGHT'],
  ['EXECUTING', 'CREATE_FAILED', 'FAILED'],
  ['EXECUTING', 'RELEASE', 'WATCHING'],
  ['IN_FLIGHT', 'PAID', 'PAID'],
  ['IN_FLIGHT', 'PAYOUT_FAILED', 'FAILED'],
  ['IN_FLIGHT', 'CANCEL_TRANSFER', 'CANCELLED'],
  ['PAID', 'LATE_FAILURE', 'FAILED'],
  ['FAILED', 'REARM', 'READY'],
  ['DRAFT', 'CANCEL', 'CANCELLED'],
  ['READY', 'CANCEL', 'CANCELLED'],
  ['WATCHING', 'CANCEL', 'CANCELLED'],
  ['PAUSED', 'CANCEL', 'CANCELLED'],
  ['READY', 'SET_STRATEGY', 'READY'],
  ['WATCHING', 'SET_STRATEGY', 'WATCHING'],
  ['PAUSED', 'SET_STRATEGY', 'PAUSED'],
];

describe('bill state machine', () => {
  it('allows exactly the transitions in the lifecycle', () => {
    const allowed = new Set(LEGAL.map(([from, event]) => `${from}:${event}`));
    for (const [from, event, to] of LEGAL) {
      expect(transition(from, event)).toMatchObject({ to });
    }
    for (const state of BILL_STATES) {
      for (const event of TRANSITION_EVENTS) {
        if (allowed.has(`${state}:${event}`)) continue;
        expect(() => transition(state, event)).toThrow(InvalidStateError);
      }
    }
  });

  it('gives cancelled no way out, and paid only a late failure', () => {
    for (const event of TRANSITION_EVENTS) {
      expect(() => transition('CANCELLED', event)).toThrow(InvalidStateError);
      if (event === 'LATE_FAILURE') {
        expect(transition('PAID', event).to).toBe('FAILED');
      } else {
        expect(() => transition('PAID', event)).toThrow(InvalidStateError);
      }
    }
  });

  it('claims an execution only from a watching or paused bill', () => {
    expect(claimExecutionCreate('WATCHING').allowedFrom).toEqual(['WATCHING', 'PAUSED']);
    expect(claimExecutionCreate('PAUSED').to).toBe('EXECUTING');
    expect(() => claimExecutionCreate('READY')).toThrow(InvalidStateError);
    expect(() => claimExecutionCreate('EXECUTING')).toThrow(InvalidStateError);
  });
});
