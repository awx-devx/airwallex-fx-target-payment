import { describe, expect, it } from 'vitest';
import { AirwallexClient } from '@/server/adapters/airwallex/client';
import { createTransfer } from '@/server/adapters/airwallex/endpoints/transfers';
import { AirwallexError } from '@/server/adapters/airwallex/errors';
import {
  jsonNumber,
  stringifyAirwallexJson,
} from '@/server/adapters/airwallex/json';
import { createLogger } from '@/server/logging/logger';

const now = new Date('2026-01-01T00:00:00.000Z');

function json(
  status: number,
  body: string,
  headers?: Record<string, string>,
): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function harness(
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>,
) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const sleeps: number[] = [];
  const client = new AirwallexClient({
    baseUrl: 'https://api.sandbox.airwallex.com',
    filesBaseUrl: 'https://files.sandbox.airwallex.com',
    apiVersion: '2026-08-21',
    versionOverrides: { transfers: '2025-06-30' },
    clientId: 'client-id',
    apiKey: 'secret-key',
    loginAs: 'acct_123',
    envName: 'sandbox',
    flags: { spend: false, files: false },
    clock: { now: () => now },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 1,
    logger: createLogger({ level: 'silent' }),
    fetch: async (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, init: init ?? {} });
      if (url.pathname === '/api/v1/authentication/login') {
        return json(
          200,
          '{"token":"tok-1","expires_at":"2026-01-01T00:30:00+0000"}',
        );
      }
      return handler(url, init ?? {});
    },
  });
  return { client, calls, sleeps };
}

function header(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

describe('AirwallexClient', () => {
  it('logs in once, sends x-login-as, and skips the version header on login', async () => {
    const { client, calls } = harness(() => json(200, '{"ok":true}'));
    await client.request({ method: 'GET', path: '/balances/current' });
    await client.request({ method: 'GET', path: '/balances/current' });
    const logins = calls.filter((call) =>
      call.url.pathname.endsWith('/authentication/login'),
    );
    expect(logins).toHaveLength(1);
    expect(header(logins[0].init, 'x-client-id')).toBe('client-id');
    expect(header(logins[0].init, 'x-api-key')).toBe('secret-key');
    expect(header(logins[0].init, 'x-login-as')).toBe('acct_123');
    expect(header(logins[0].init, 'x-api-version')).toBeNull();
    expect(header(logins[0].init, 'authorization')).toBeNull();
    const reads = calls.filter((call) =>
      call.url.pathname.endsWith('/balances/current'),
    );
    expect(header(reads[0].init, 'authorization')).toBe('Bearer tok-1');
    expect(header(reads[0].init, 'x-api-version')).toBe('2026-08-21');
  });

  it('uses the per-group version override', async () => {
    const { client, calls } = harness(() => json(200, '{"ok":true}'));
    await client.request({
      method: 'GET',
      path: '/transfers/11111111-1111-1111-1111-111111111111',
    });
    const transfer = calls.find((call) =>
      call.url.pathname.includes('/transfers/'),
    );
    expect(header(transfer!.init, 'x-api-version')).toBe('2025-06-30');
  });

  it('retries a create that carries the same request_id', async () => {
    let attempts = 0;
    const { client, calls, sleeps } = harness(() => {
      attempts += 1;
      if (attempts < 3)
        return json(500, '{"code":"service_unavailable","message":"down"}');
      return json(200, '{"id":"tr_1"}');
    });
    const body = { request_id: 'tr:bill-1:1', transfer_amount: '10.00' };
    await expect(
      client.request({ method: 'POST', path: '/transfers/create', body }),
    ).resolves.toEqual({ id: 'tr_1' });
    const creates = calls.filter((call) =>
      call.url.pathname.endsWith('/transfers/create'),
    );
    expect(creates).toHaveLength(3);
    expect(creates.map((call) => call.init.body)).toEqual([
      stringifyAirwallexJson(body),
      stringifyAirwallexJson(body),
      stringifyAirwallexJson(body),
    ]);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('does not retry a create that has no request_id', async () => {
    const { client, calls } = harness(() =>
      json(500, '{"code":"service_unavailable","message":"down"}'),
    );
    await expect(
      client.request({
        method: 'POST',
        path: '/fx/quotes/create',
        body: { buy_amount: jsonNumber('250000.00'), buy_currency: 'EUR' },
      }),
    ).rejects.toBeInstanceOf(AirwallexError);
    const quotes = calls.filter((call) =>
      call.url.pathname.endsWith('/fx/quotes/create'),
    );
    expect(quotes).toHaveLength(1);
    expect(String(quotes[0].init.body)).toContain('"buy_amount":250000.00');
  });

  it('backs off on 429 and then succeeds', async () => {
    let attempts = 0;
    const { client, sleeps } = harness(() => {
      attempts += 1;
      if (attempts === 1)
        return json(429, '{"code":"too_many_requests","message":"slow down"}');
      return json(200, '{"ok":true}');
    });
    await expect(
      client.request({ method: 'GET', path: '/fx/rates/current' }),
    ).resolves.toEqual({
      ok: true,
    });
    expect(sleeps).toEqual([1000]);
  });

  it('drops the token and logs in once after a 401', async () => {
    let attempts = 0;
    const { client, calls } = harness(() => {
      attempts += 1;
      if (attempts === 1)
        return json(401, '{"code":"credentials_expired","message":"expired"}');
      return json(
        200,
        '{"token":"tok-2","expires_at":"2026-01-01T00:30:00+0000","ok":true}',
      );
    });
    const result = await client.request({
      method: 'GET',
      path: '/balances/current',
    });
    expect(result).toMatchObject({ ok: true });
    expect(
      calls.filter((call) =>
        call.url.pathname.endsWith('/authentication/login'),
      ),
    ).toHaveLength(2);
  });

  it('treats a duplicate request id as the existing transfer', async () => {
    const created = {
      id: 't-existing',
      short_reference_id: 'P260101-ABC',
      request_id: 'tr:bill-1:1',
      status: 'PROCESSING',
      transfer_method: 'LOCAL',
      source_amount: '10.00',
      source_currency: 'USD',
      transfer_amount: '8.00',
      transfer_currency: 'EUR',
      conversion: { rate: '1.25', currency_pair: 'EURUSD' },
      updated_at: '2026-01-01T00:00:00+0000',
    };
    const { client, calls } = harness((url) => {
      if (url.pathname.endsWith('/transfers/create')) {
        return json(
          400,
          '{"code":"duplicate_request_id","message":"Duplicate","details":{"id":"t-existing"}}',
        );
      }
      return json(200, JSON.stringify(created));
    });
    const execution = await createTransfer(client, {
      billId: 'bill-1',
      attempt: 1,
      beneficiaryId: 'ben-1',
      transferCurrency: 'EUR',
      transferAmount: '8.00',
      sourceCurrency: 'USD',
      transferMethod: 'LOCAL',
      reason: 'bill_payment',
      reference: 'INV-1',
      mode: 'TARGET',
    });
    expect(execution.transferId).toBe('t-existing');
    expect(
      calls.some((call) => call.url.pathname.endsWith('/transfers/t-existing')),
    ).toBe(true);
    const create = calls.find((call) =>
      call.url.pathname.endsWith('/transfers/create'),
    );
    expect(String(create?.init.body)).toContain('"request_id":"tr:bill-1:1"');
  });

  it('keeps amounts that JSON.parse would round', async () => {
    const { client } = harness(() =>
      json(200, '{"sell_amount":9007199254740993}'),
    );
    await expect(
      client.request({ method: 'GET', path: '/fx/quotes/q1' }),
    ).resolves.toEqual({
      sell_amount: '9007199254740993',
    });
  });

  it('refuses files and simulation outside their flags', async () => {
    const { client } = harness(() => json(200, '{}'));
    const production = new AirwallexClient({
      baseUrl: 'https://api.airwallex.com',
      filesBaseUrl: 'https://files.airwallex.com',
      apiVersion: '2026-08-21',
      envName: 'production',
      flags: { spend: false, files: true },
      clock: { now: () => now },
      logger: createLogger({ level: 'silent' }),
      fetch: async () => json(200, '{}'),
    });
    await expect(
      client.request({ method: 'GET', path: '/balances/current' }),
    ).resolves.toBeDefined();
    expect(() => client.assertFilesEnabled()).toThrow(/FILES_UPLOAD/);
    expect(() => production.assertSandbox()).toThrow(/sandbox/);
  });
});
