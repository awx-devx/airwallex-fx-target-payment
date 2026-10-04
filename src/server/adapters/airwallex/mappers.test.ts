import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AirwallexError, toApiError } from '@/server/adapters/airwallex/errors';
import { airwallexErrorFromBody } from '@/server/adapters/airwallex/errors';
import {
  mapBalances,
  mapCurrentRate,
  mapFormSchema,
  mapQuote,
  mapTransfer,
  mapVerification,
  orient,
} from '@/server/adapters/airwallex/mappers';

const quote = {
  quote_id: 'q-1',
  buy_currency: 'EUR',
  sell_currency: 'USD',
  buy_amount: '100',
  sell_amount: '151',
  client_rate: '1.51',
  currency_pair: 'EURUSD',
  mid_rate: '1.5',
  validity: 'MIN_1',
  valid_from_at: '2026-01-01T00:00:00+0000',
  valid_to_at: '2026-01-01T00:01:00+0000',
  usage: 'SINGLE_USE',
  conversion_date: '2026-01-02',
};

function transfer(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: 't-1',
    short_reference_id: 'P260101-ABC',
    request_id: 'tr:bill:1',
    status,
    funding: { status: 'PROCESSING' },
    conversion: { rate: '0.8', currency_pair: 'USDEUR' },
    source_amount: '125.00',
    source_currency: 'USD',
    transfer_amount: '100.00',
    transfer_currency: 'EUR',
    amount_payer_pays: '126.00',
    amount_beneficiary_receives: '100.00',
    fee_amount: '1.00',
    fee_currency: 'USD',
    fee_paid_by: 'PAYER',
    transfer_method: 'LOCAL',
    updated_at: '2026-01-01T00:00:00+0000',
    ...extra,
  };
}

describe('price mapper', () => {
  it('derives p from CLIENT amounts and ignores the market rate', () => {
    const mapped = mapCurrentRate(
      {
        rate_details: [
          { level: 'AWX', buy_amount: '100', sell_amount: '90' },
          { level: 'CLIENT', buy_amount: '10000', sell_amount: '12794.27' },
        ],
        rate: '0.5',
        currency_pair: 'EURUSD',
        dealt_currency: 'EUR',
        created_at: '2026-01-01T00:00:00+0000',
        conversion_date: '2026-01-02',
      },
      'EUR',
    );
    expect(mapped.price).toBe('1.279427');
    expect(mapped.price).not.toBe('0.5');
    expect(mapped.ts).toBe('2026-01-01T00:00:00.000Z');
  });

  it('drops a tick with no CLIENT level', () => {
    expect(() =>
      mapCurrentRate(
        { rate_details: [{ level: 'AWX', buy_amount: '1', sell_amount: '1' }] },
        'EUR',
      ),
    ).toThrow(/CLIENT/);
  });

  it('orients an inverse pair and builds the quote price from amounts', () => {
    expect(orient('0.8', 'USDEUR', 'EUR', 'USD')).toBe('1.25');
    const mapped = mapQuote(quote);
    expect(mapped.price).toBe('1.51');
    expect(mapped.clientRate).toBe('1.51');
    expect(mapped.clientRateOriented).toBe('1.51');
    expect(mapped.midPrice).toBe('1.5');
    expect(mapped.spreadBps).toBe(66.67);
    expect(mapped.validFromAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('orients the quote rate when the pair is quoted backwards', () => {
    const mapped = mapQuote({
      ...quote,
      currency_pair: 'USDEUR',
      client_rate: '0.8',
      mid_rate: '0.8',
    });
    expect(mapped.price).toBe('1.51');
    expect(mapped.clientRate).toBe('0.8');
    expect(mapped.clientRateOriented).toBe('1.25');
  });
});

describe('transfer mapper', () => {
  it('maps funding, fees, and tentative amounts, including a webhook object', () => {
    const pending = mapTransfer(transfer('IN_APPROVAL'), 'TARGET');
    expect(pending.amountsTentative).toBe(true);
    expect(pending.funding).toEqual({ status: 'PROCESSING' });
    expect(pending.fee).toEqual({
      amount: '1.00',
      currency: 'USD',
      paidBy: 'PAYER',
    });
    expect(pending.rate).toBe('1.25');
    expect(pending.mode).toBe('TARGET');

    const confirmed = mapTransfer(transfer('SCHEDULED'), 'DEADLINE');
    expect(confirmed.amountsTentative).toBe(false);
    expect(confirmed.mode).toBe('DEADLINE');
  });

  it('categories a failure from details.type before the numeric code', () => {
    const failed = mapTransfer(
      transfer('FAILED', {
        failure: {
          code: '90502',
          message: 'Suspended',
          details: { type: 'TM_SUSPEND', reason_codes: ['TM_SUSPENDED'] },
        },
      }),
      'MANUAL',
    );
    expect(failed.failure?.category).toBe('COMPLIANCE');
    expect(failed.failure?.reasonCodes).toEqual(['TM_SUSPENDED']);
    const paid = mapTransfer(transfer('PAID'), 'TARGET');
    expect(paid.lateFailureWatchUntil).toBe('2026-01-04T00:00:00.000Z');
  });
});

describe('other mappers', () => {
  it('keeps cash balances and maps a form field and a verification', () => {
    const balances = mapBalances(
      [
        {
          currency: 'USD',
          available_amount: '10.00',
          pending_amount: '1.00',
          reserved_amount: '2.00',
          total_amount: '13.00',
          account_type: 'cash',
        },
        {
          currency: 'EUR',
          available_amount: '3.00',
          pending_amount: '0',
          reserved_amount: '0',
          total_amount: '3.00',
          account_type: 'yield',
        },
      ],
      '2026-01-01T00:00:00.000Z',
    );
    expect(balances.map((row) => row.currency)).toEqual(['USD']);
    expect(balances[0].available).toBe('10.00');

    const schema = mapFormSchema(
      {
        fields: [
          {
            path: 'beneficiary.bank_details.iban',
            required: true,
            enabled: true,
            field: {
              key: 'iban',
              label: 'IBAN',
              type: 'INPUT',
              refresh: false,
            },
            rule: { pattern: '^[A-Z0-9]+$' },
          },
        ],
      },
      {
        bankCountry: 'DE',
        accountCurrency: 'EUR',
        transferMethod: 'LOCAL',
        entityType: 'COMPANY',
      },
    );
    expect(schema.fields[0]).toMatchObject({
      path: 'beneficiary.bank_details.iban',
      key: 'iban',
      type: 'INPUT',
      required: true,
      pattern: '^[A-Z0-9]+$',
    });

    const verification = mapVerification(
      {
        code: 'VERIFIED',
        resolved_account_name: 'Acme GmbH',
        details: { account_name_match_result: 'FULL_MATCH' },
      },
      '2026-01-01T00:00:00.000Z',
    );
    expect(verification.nameMatch).toBe('FULL_MATCH');
    expect(verification.resolvedAccountName).toBe('Acme GmbH');
  });
});

describe('error mapping', () => {
  it('collapses endpoint spellings onto one ApiError code', () => {
    const error = airwallexErrorFromBody(400, {
      code: 'expired_quote',
      message: 'Quote expired',
    });
    expect(error.code).toBe('quote_expired');
    expect(toApiError(error).code).toBe('QUOTE_EXPIRED');
    expect(toApiError(error).airwallex?.code).toBe('expired_quote');
  });

  it('turns validation_failed into field errors and does not treat a duplicate as an ApiError', () => {
    const failed = airwallexErrorFromBody(400, {
      code: 'validation_failed',
      message: 'Invalid',
      details: {
        errors: [
          {
            source: 'beneficiary.address.street_address',
            code: '018',
            params: { length_min: '5', length_max: '200' },
          },
        ],
      },
    });
    expect(toApiError(failed).code).toBe('VALIDATION_FAILED');
    expect(failed.fieldErrors?.[0]).toMatchObject({
      path: 'beneficiary.address.street_address',
      code: '018',
    });
    expect(failed.fieldErrors?.[0].message.length).toBeGreaterThan(0);

    const duplicate = airwallexErrorFromBody(400, {
      code: 'request_id_duplicate',
      message: 'Duplicate',
      details: { id: 'existing-transfer' },
    });
    expect(duplicate.code).toBe('duplicate_request_id');
    expect(() => toApiError(duplicate)).toThrow(/not an ApiError/);
    expect(() =>
      toApiError(
        new AirwallexError({
          status: 409,
          code: 'request_pending',
          message: 'pending',
        }),
      ),
    ).toThrow(/not an ApiError/);
  });

  it('maps the redacted sandbox fixtures from the B2 smoke', () => {
    const load = (name: string): unknown => {
      const parsed: unknown = JSON.parse(
        readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8'),
      );
      if (typeof parsed !== 'object' || parsed === null || !('body' in parsed)) {
        throw new Error(`${name} has no body`);
      }
      return parsed.body;
    };
    expect(mapCurrentRate(load('v2-rates-current.json'), 'EUR').price).toBe('1.133176');
    const locked = mapQuote(load('v4-quote.json'));
    expect(locked.airwallexQuoteId).toBe('b41a6a84-fa5e-3417-876b-897b99e191cd');
    expect(locked.price).toBe('1.133');
    const created = mapTransfer(load('v4-transfer.json'), 'TARGET');
    expect(created.transferId).toBe('32fc234b-aa05-42dc-8996-4fbdaa99ed0d');
    expect(created.status).toBe('SCHEDULED');
  });
});
