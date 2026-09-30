import { describe, expect, it } from 'vitest';
import type { AccountVerification } from '@/contracts/airwallex';
import { BILL_STATES, type BillState, type Role } from '@/contracts/bill';
import { allowedActions } from '@/contracts/permissions';

const verified: AccountVerification = {
  code: 'VERIFIED',
  nameMatch: 'FULL_MATCH',
  checkedAt: '2026-10-01T14:00:00.000Z',
};

function bill(state: BillState, beneficiary?: 'verified' | 'invalid' | 'none') {
  return {
    state,
    flags: {},
    beneficiary:
      beneficiary === 'none' || beneficiary === undefined
        ? undefined
        : {
            id: 'bf',
            airwallexBeneficiaryId: 'awx',
            name: 'Acme GmbH',
            entityType: 'COMPANY' as const,
            bankCountry: 'DE',
            accountCurrency: 'EUR',
            maskedAccount: '••••3000',
            transferMethods: ['LOCAL' as const],
            verification: {
              ...verified,
              code: beneficiary === 'invalid' ? ('INVALID' as const) : ('VERIFIED' as const),
            },
          },
  };
}

const EXPECTED: Record<BillState, { preparer: string[]; approver: string[] }> = {
  DRAFT: {
    preparer: ['REVIEW', 'EDIT', 'RESOLVE_BENEFICIARY', 'CANCEL'],
    approver: ['REVIEW', 'EDIT', 'RESOLVE_BENEFICIARY', 'CANCEL'],
  },
  READY: {
    preparer: ['EDIT', 'RESOLVE_BENEFICIARY', 'ARM', 'EDIT_STRATEGY', 'CANCEL'],
    approver: ['EDIT', 'RESOLVE_BENEFICIARY', 'ARM', 'EDIT_STRATEGY', 'CANCEL'],
  },
  WATCHING: {
    preparer: ['EDIT_STRATEGY', 'PAUSE', 'PAY_NOW', 'CANCEL'],
    approver: ['EDIT_STRATEGY', 'PAUSE', 'PAY_NOW', 'CANCEL'],
  },
  PAUSED: {
    preparer: ['EDIT_STRATEGY', 'RESUME', 'CANCEL'],
    approver: ['EDIT_STRATEGY', 'RESUME', 'CANCEL'],
  },
  TARGET_HIT: {
    preparer: ['CANCEL'],
    approver: ['APPROVE', 'HOLD', 'CANCEL'],
  },
  DEADLINE_WINDOW: {
    preparer: ['CANCEL'],
    approver: ['APPROVE', 'CANCEL'],
  },
  AUTO_SETTLING: { preparer: [], approver: [] },
  APPROVED: { preparer: [], approver: [] },
  EXECUTING: { preparer: [], approver: [] },
  IN_FLIGHT: { preparer: [], approver: [] },
  PAID: { preparer: [], approver: [] },
  FAILED: {
    preparer: ['EDIT', 'RESOLVE_BENEFICIARY', 'REARM'],
    approver: ['EDIT', 'RESOLVE_BENEFICIARY', 'REARM'],
  },
  CANCELLED: { preparer: [], approver: [] },
};

describe('allowedActions', () => {
  const roles: Role[] = ['preparer', 'approver'];

  it('covers every state', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...BILL_STATES].sort());
  });

  for (const state of BILL_STATES) {
    for (const role of roles) {
      it(`${state} × ${role}`, () => {
        const beneficiary = state === 'DRAFT' ? 'none' : 'verified';
        expect(allowedActions(bill(state, beneficiary), role)).toEqual(EXPECTED[state][role]);
      });
    }
  }

  it('blocks arming when the account does not exist', () => {
    expect(allowedActions(bill('READY', 'invalid'), 'approver')).not.toContain('ARM');
  });

  it('blocks arming until a beneficiary is resolved', () => {
    expect(allowedActions(bill('READY', 'none'), 'approver')).not.toContain('ARM');
  });

  it('offers simulate and advance only in demo mode', () => {
    expect(allowedActions(bill('WATCHING', 'verified'), 'preparer', { demoMode: true })).toContain(
      'SIMULATE',
    );
    expect(
      allowedActions(bill('WATCHING', 'verified'), 'preparer', {
        demoMode: true,
        simulationRunning: true,
      }),
    ).toEqual(['EDIT_STRATEGY', 'PAUSE', 'PAY_NOW', 'CANCEL', 'STOP_SIMULATION']);
    expect(allowedActions(bill('IN_FLIGHT', 'verified'), 'approver', { demoMode: true })).toEqual([
      'ADVANCE_TRANSFER',
    ]);
    expect(allowedActions(bill('WATCHING', 'verified'), 'preparer')).not.toContain('SIMULATE');
  });
});
