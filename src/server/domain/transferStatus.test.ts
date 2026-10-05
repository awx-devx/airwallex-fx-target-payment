import { decideTransferUpdate } from '@/server/domain/transferStatus';
import { describe, expect, it } from 'vitest';

const at = Date.parse('2026-06-01T12:00:00.000Z');

describe('decideTransferUpdate', () => {
  it('ignores an older update and a status that moves backwards', () => {
    expect(
      decideTransferUpdate({
        billState: 'IN_FLIGHT',
        storedStatus: 'SENT',
        storedUpdatedAt: at,
        incomingStatus: 'PROCESSING',
        incomingUpdatedAt: at - 1,
        cancelRequested: false,
      }).kind,
    ).toBe('ignore');
    expect(
      decideTransferUpdate({
        billState: 'IN_FLIGHT',
        storedStatus: 'SENT',
        storedUpdatedAt: at,
        incomingStatus: 'PROCESSING',
        incomingUpdatedAt: at + 1,
        cancelRequested: false,
      }).kind,
    ).toBe('ignore');
  });

  it('lets FAILED replace PAID and ignores CANCELLED after FAILED', () => {
    expect(
      decideTransferUpdate({
        billState: 'PAID',
        storedStatus: 'PAID',
        storedUpdatedAt: at,
        incomingStatus: 'FAILED',
        incomingUpdatedAt: at + 1,
        cancelRequested: false,
      }),
    ).toMatchObject({ kind: 'apply', event: 'LATE_FAILURE' });
    expect(
      decideTransferUpdate({
        billState: 'FAILED',
        storedStatus: 'FAILED',
        storedUpdatedAt: at,
        incomingStatus: 'CANCELLED',
        incomingUpdatedAt: at + 1,
        cancelRequested: false,
      }).kind,
    ).toBe('ignore');
  });

  it('turns an overdue auto-cancel into a failure and honours our own cancel', () => {
    expect(
      decideTransferUpdate({
        billState: 'IN_FLIGHT',
        storedStatus: 'OVERDUE',
        storedUpdatedAt: at,
        incomingStatus: 'CANCELLED',
        incomingUpdatedAt: at + 1,
        cancelRequested: false,
      }),
    ).toMatchObject({
      kind: 'apply',
      status: 'FAILED',
      event: 'PAYOUT_FAILED',
      failure: { message: 'Not funded' },
    });
    expect(
      decideTransferUpdate({
        billState: 'IN_FLIGHT',
        storedStatus: 'PROCESSING',
        storedUpdatedAt: at,
        incomingStatus: 'CANCELLED',
        incomingUpdatedAt: at + 1,
        cancelRequested: true,
      }),
    ).toMatchObject({ kind: 'apply', event: 'CANCEL_TRANSFER', deactivate: true });
    expect(
      decideTransferUpdate({
        billState: 'IN_FLIGHT',
        storedStatus: 'PROCESSING',
        storedUpdatedAt: at,
        incomingStatus: 'CANCELLED',
        incomingUpdatedAt: at + 1,
        cancelRequested: false,
      }).kind,
    ).toBe('ignore');
  });
});
