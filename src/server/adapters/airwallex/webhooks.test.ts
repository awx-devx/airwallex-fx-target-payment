import { describe, expect, it } from 'vitest';
import {
  knownTransferStatus,
  parseWebhookEvent,
  readWebhook,
  webhookSignature,
  WebhookVerificationError,
} from '@/server/adapters/airwallex/webhooks';
import { mapTransfer } from '@/server/adapters/airwallex/mappers';

const secret = 'whsec_test';
const now = new Date('2026-01-01T00:00:00.000Z');
const raw = JSON.stringify({
  id: 'evt_1',
  name: 'payout.transfer.processing',
  account_id: 'acct_1',
  created_at: '2026-01-01T00:00:00+0000',
  version: '2026-08-21',
  data: {
    object: {
      id: 't-1',
      short_reference_id: 'P260101-ABC',
      request_id: 'tr:bill:1',
      status: 'PROCESSING',
      transfer_method: 'SWIFT',
      source_amount: '10.00',
      source_currency: 'USD',
      transfer_amount: '8.00',
      transfer_currency: 'EUR',
      conversion: { rate: '1.25', currency_pair: 'EURUSD' },
      swift_charge_option: 'PAYER',
      updated_at: '2026-01-01T00:00:00+0000',
    },
  },
});

function signed(body: string, timestamp = String(now.getTime())) {
  return {
    rawBody: body,
    secret,
    timestamp,
    signature: webhookSignature(secret, timestamp, body),
    now,
  };
}

describe('webhook signature', () => {
  it('accepts a matching signature and parses the envelope', () => {
    const event = readWebhook(signed(raw));
    expect(event.id).toBe('evt_1');
    expect(event.name).toBe('payout.transfer.processing');
    expect(event.createdAt).toBe('2026-01-01T00:00:00.000Z');
    const execution = mapTransfer(event.object, 'TARGET');
    expect(execution.transferId).toBe('t-1');
    expect(execution.rate).toBe('1.25');
    expect(execution.swiftChargeOption).toBe('PAYER');
  });

  it('rejects a tampered body', () => {
    const input = signed(raw);
    expect(() =>
      readWebhook({ ...input, rawBody: raw.replace('PROCESSING', 'PAID') }),
    ).toThrow(WebhookVerificationError);
  });

  it('rejects a timestamp outside five minutes', () => {
    const stale = String(now.getTime() - 6 * 60 * 1000);
    expect(() =>
      readWebhook({
        rawBody: raw,
        secret,
        timestamp: stale,
        signature: webhookSignature(secret, stale, raw),
        now,
      }),
    ).toThrow(/tolerance/);
  });

  it('parses amounts in the object without rounding', () => {
    const body = raw.replace(
      '"source_amount":"10.00"',
      '"source_amount":9007199254740993',
    );
    const event = parseWebhookEvent(body);
    const object = event.object as { source_amount: string };
    expect(object.source_amount).toBe('9007199254740993');
  });

  it('reads a transfer placed directly under data', () => {
    const flat = JSON.stringify({
      id: 'evt_flat',
      name: 'payout.transfer.scheduled',
      account_id: 'acct_flat',
      created_at: '2025-07-09T15:41:51+0000',
      version: '2025-06-30',
      data: {
        id: 't-flat',
        short_reference_id: 'P250709-K61UKW4',
        request_id: 'tr:bill:1',
        status: 'SCHEDULED',
        transfer_method: 'LOCAL',
        source_amount: 68.14,
        source_currency: 'SGD',
        transfer_amount: 50,
        transfer_currency: 'USD',
        conversion: { rate: 1.285682, currency_pair: 'USDSGD' },
        updated_at: '2025-07-09T15:41:50+0000',
      },
    });
    const event = parseWebhookEvent(flat);
    expect(event.accountId).toBe('acct_flat');
    expect(event.version).toBe('2025-06-30');
    expect(mapTransfer(event.object, 'TARGET').transferId).toBe('t-flat');
    expect(knownTransferStatus(event.object)).toBe('SCHEDULED');
  });

  it('accepts a deposit envelope with a camelCase account id and no version', () => {
    const deposit = JSON.stringify({
      id: 'evt_dep',
      name: 'deposit.settled',
      accountId: 'acct_dep',
      data: { id: 'dep_1', status: 'SETTLED', amount: 100 },
    });
    const event = parseWebhookEvent(deposit);
    expect(event.accountId).toBe('acct_dep');
    expect(event.createdAt).toBeUndefined();
    expect(event.version).toBeUndefined();
    expect(event.object).toMatchObject({ id: 'dep_1', status: 'SETTLED' });
  });

  it('does not treat an unknown transfer status as one we apply', () => {
    expect(knownTransferStatus({ status: 'PROCESSING' })).toBe('PROCESSING');
    expect(knownTransferStatus({ status: 'SOMETHING_NEW' })).toBeUndefined();
    expect(knownTransferStatus({})).toBeUndefined();
  });
});
