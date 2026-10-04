import { describe, expect, it } from 'vitest';
import {
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
});
