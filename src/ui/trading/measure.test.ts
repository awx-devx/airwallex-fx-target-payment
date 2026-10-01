import { describe, expect, it } from 'vitest';
import { TRANSFER_STATUSES } from '@/contracts/airwallex';
import {
  countdownUrgency,
  distanceToTarget,
  secondsBetween,
  transferStatusLabel,
  transferStepIndex,
} from '@/ui/trading/measure';
import { verificationView } from '@/ui/trading/verification';

describe('distanceToTarget', () => {
  it('bands a price against the target', () => {
    expect(distanceToTarget('1.10', '1.08').band).toBe('far');
    expect(distanceToTarget('1.082', '1.08').band).toBe('near');
    expect(distanceToTarget('1.085', '1.08').band).toBe('mid');
    expect(distanceToTarget('1.08', '1.08').band).toBe('through');
    expect(distanceToTarget('1.07', '1.08').band).toBe('through');
  });
});

describe('countdownUrgency', () => {
  it('warns inside five minutes and pulses inside a minute', () => {
    expect(countdownUrgency(300)).toBe('normal');
    expect(countdownUrgency(299)).toBe('warn');
    expect(countdownUrgency(60)).toBe('warn');
    expect(countdownUrgency(59)).toBe('urgent');
    expect(countdownUrgency(0)).toBe('expired');
  });

  it('measures a fixed window', () => {
    expect(
      secondsBetween('2026-10-01T12:00:00.000Z', '2026-10-01T12:00:45.000Z'),
    ).toBe(45);
  });
});

describe('transferStatusLabel', () => {
  it('names every status, including approval, overdue, and late failure', () => {
    for (const status of TRANSFER_STATUSES) {
      expect(transferStatusLabel(status).length).toBeGreaterThan(0);
    }
    expect(transferStatusLabel('IN_APPROVAL')).toBe('Awaiting Airwallex approval');
    expect(transferStatusLabel('APPROVAL_BLOCKED')).toBe(
      'Awaiting Airwallex approval',
    );
    expect(transferStatusLabel('OVERDUE')).toBe('Overdue');
    expect(transferStatusLabel('FAILED', { category: 'COMPLIANCE' })).toBe(
      'Failed · compliance',
    );
    expect(transferStatusLabel('PAID', { lateFailure: true })).toBe(
      'Failed after paid',
    );
    expect(transferStepIndex('SENT')).toBe(2);
    expect(transferStepIndex('OVERDUE')).toBe(0);
    expect(transferStepIndex('FAILED')).toBe(-1);
  });
});

describe('verificationView', () => {
  const checked = '2026-10-01T12:00:00.000Z';

  it('covers every arming outcome', () => {
    expect(
      verificationView({
        code: 'VERIFIED',
        nameMatch: 'FULL_MATCH',
        checkedAt: checked,
      }).confirm,
    ).toBe('none');
    expect(
      verificationView({
        code: 'VERIFIED',
        nameMatch: 'PARTIAL_MATCH',
        resolvedAccountName: 'Helios GmbH',
        checkedAt: checked,
      }).label,
    ).toBe('Name partially matches: Helios GmbH');
    expect(
      verificationView({
        code: 'VERIFIED',
        nameMatch: 'NOT_MATCHED',
        resolvedAccountName: 'Other Ltd',
        checkedAt: checked,
      }).confirm,
    ).toBe('danger');
    expect(
      verificationView({ code: 'INVALID', checkedAt: checked }).confirm,
    ).toBe('blocked');
    expect(
      verificationView({ code: 'NOT_SUPPORTED', checkedAt: checked }).label,
    ).toBe('Not verified');
  });
});
