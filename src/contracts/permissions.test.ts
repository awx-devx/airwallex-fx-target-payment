import { describe, expect, it } from 'vitest';
import { BILL_STATES, type BillState, type BillSummary } from '@/contracts/bill';
import { allowedActions } from '@/contracts/permissions';

function bill(
  state: BillState,
  beneficiary: 'none' | 'verified' | 'invalid',
): Pick<BillSummary, 'state' | 'flags' | 'beneficiary'> {
  return {
    state,
    flags: {},
    beneficiary:
      beneficiary === 'none'
        ? undefined
        : {
            id: 'bf',
            airwallexBeneficiaryId: 'awx',
            name: 'Vendor',
            entityType: 'COMPANY',
            bankCountry: 'DE',
            accountCurrency: 'EUR',
            maskedAccount: '••••1',
            transferMethods: ['LOCAL'],
            verification: {
              code: beneficiary === 'invalid' ? 'INVALID' : 'VERIFIED',
              checkedAt: '2026-10-01T00:00:00.000Z',
            },
          },
  };
}

const EXPECTED: Record<BillState, string[]> = {
  DRAFT: ['REVIEW', 'EDIT', 'RESOLVE_BENEFICIARY', 'CANCEL'],
  READY: ['EDIT', 'RESOLVE_BENEFICIARY', 'ARM', 'EDIT_STRATEGY', 'CANCEL'],
  WATCHING: ['EDIT_STRATEGY', 'PAUSE', 'PAY_NOW', 'CANCEL'],
  PAUSED: ['EDIT_STRATEGY', 'RESUME', 'CANCEL'],
  EXECUTING: [],
  IN_FLIGHT: [],
  PAID: [],
  FAILED: ['EDIT', 'RESOLVE_BENEFICIARY', 'REARM'],
  CANCELLED: [],
};

describe('allowedActions', () => {
  it('covers every state', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...BILL_STATES].sort());
  });

  for (const state of BILL_STATES) {
    it(state, () => {
      const beneficiary = state === 'DRAFT' ? 'none' : 'verified';
      expect(allowedActions(bill(state, beneficiary))).toEqual(EXPECTED[state]);
    });
  }

  it('blocks arming when the account does not exist', () => {
    expect(allowedActions(bill('READY', 'invalid'))).not.toContain('ARM');
  });

  it('blocks arming until a beneficiary is resolved', () => {
    expect(allowedActions(bill('READY', 'none'))).not.toContain('ARM');
  });

  it('offers simulate and advance only in demo mode', () => {
    expect(allowedActions(bill('WATCHING', 'verified'), { demoMode: true })).toContain('SIMULATE');
    expect(
      allowedActions(bill('WATCHING', 'verified'), {
        demoMode: true,
        simulationRunning: true,
      }),
    ).toEqual(['EDIT_STRATEGY', 'PAUSE', 'PAY_NOW', 'CANCEL', 'STOP_SIMULATION']);
    expect(allowedActions(bill('IN_FLIGHT', 'verified'), { demoMode: true })).toEqual([
      'ADVANCE_TRANSFER',
    ]);
    expect(
      allowedActions(
        { ...bill('IN_FLIGHT', 'verified'), execution: { status: 'PROCESSING' } },
        { demoMode: true },
      ),
    ).toEqual(['CANCEL', 'ADVANCE_TRANSFER']);
    expect(
      allowedActions({ ...bill('IN_FLIGHT', 'verified'), execution: { status: 'SENT' } }),
    ).not.toContain('CANCEL');
    expect(allowedActions(bill('WATCHING', 'verified'))).not.toContain('SIMULATE');
  });
});
