import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentBalances } from '@/server/adapters/balances';
import { resetSharedAirwallexClients } from '@/server/adapters/airwallex/client';
import { createRateSource } from '@/server/adapters/rates';
import { quoteLock } from '@/server/adapters/quotes';
import { transferGateway } from '@/server/adapters/transfers';
import { SystemClock } from '@/server/adapters/clock';
import { parseEnv } from '@/server/env';
import { requireAirwallex } from '@/server/services/airwallexClient';
import { safetyNetGateway } from '@/server/services/safetyNet';

const quote = {
  quote_id: 'q-1',
  buy_currency: 'EUR',
  sell_currency: 'USD',
  buy_amount: '100',
  sell_amount: '110',
  client_rate: '1.1',
  currency_pair: 'EURUSD',
  validity: 'MIN_1',
  valid_from_at: '2026-01-01T00:00:00+0000',
  valid_to_at: '2026-01-01T00:01:00+0000',
  usage: 'SINGLE_USE',
  conversion_date: '2026-01-02',
};

const transfer = {
  id: 't-1',
  short_reference_id: 'P260101-ABC',
  request_id: 'tr:bill:1',
  status: 'SCHEDULED',
  transfer_method: 'LOCAL',
  source_amount: '110.00',
  source_currency: 'USD',
  transfer_amount: '100.00',
  transfer_currency: 'EUR',
  conversion: { rate: '1.1', currency_pair: 'EURUSD' },
  updated_at: '2026-01-01T00:00:00+0000',
};

const rate = {
  rate_details: [{ level: 'CLIENT', buy_amount: '100', sell_amount: '110' }],
  dealt_currency: 'EUR',
  currency_pair: 'EURUSD',
  created_at: '2026-01-01T00:00:00+0000',
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('shared Airwallex client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSharedAirwallexClients();
  });

  it('logs in once across rates, quotes, balances, transfers and the safety net', async () => {
    resetSharedAirwallexClients();
    let logins = 0;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/authentication/login')) {
        logins += 1;
        return json({
          token: 'tok-shared',
          expires_at: '2099-01-01T00:30:00+0000',
        });
      }
      if (url.pathname.endsWith('/fx/rates/current')) return json(rate);
      if (url.pathname.endsWith('/fx/quotes/create')) return json(quote);
      if (url.pathname.endsWith('/balances/current')) {
        return json([
          {
            currency: 'USD',
            available_amount: '1000',
            pending_amount: '0',
            reserved_amount: '0',
            total_amount: '1000',
          },
        ]);
      }
      if (url.pathname.endsWith('/transfers/create')) {
        return json({ ...transfer, request_id: 'sn:bill-1' });
      }
      if (url.pathname.includes('/transfers/')) return json(transfer);
      return json({});
    });

    const env = parseEnv({
      MONGODB_URI: 'mongodb://127.0.0.1:27017/fxtarget',
      REDIS_URL: 'redis://127.0.0.1:6379',
      AIRWALLEX_CLIENT_ID: 'client',
      AIRWALLEX_API_KEY: 'key',
      PAYMENTS_GATEWAY: 'airwallex',
      RATE_SOURCE: 'airwallex',
      DEADLINE_SAFETY_NET: 'airwallex',
    });
    const clock = new SystemClock();
    const rates = await createRateSource(env);
    await rates.getIndicative({ buy: 'EUR', sell: 'USD', buyAmount: '100' });
    await quoteLock(env, clock).lock({
      buy: 'EUR',
      sell: 'USD',
      buyAmount: '100',
      validity: 'MIN_1',
    });
    await currentBalances(env).getBalances();
    await transferGateway(env, clock).get('t-1', 'TARGET');
    await safetyNetGateway(env)?.schedule({
      billId: 'bill-1',
      beneficiaryId: 'ben-1',
      transferCurrency: 'EUR',
      transferAmount: '100.00',
      sourceCurrency: 'USD',
      transferMethod: 'LOCAL',
      reason: 'bill_payment',
      reference: 'INV-1',
      transferDate: '2026-10-19',
    });
    await requireAirwallex(env).confirmToken();

    expect(logins).toBe(1);
  });
});
