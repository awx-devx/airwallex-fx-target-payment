import Decimal from 'decimal.js';
import { SystemClock } from '@/server/adapters/clock';
import { AirwallexClient, airwallexUrl } from '@/server/adapters/airwallex/client';
import { AirwallexError } from '@/server/adapters/airwallex/errors';
import { jsonNumber } from '@/server/adapters/airwallex/json';
import { mapCurrentRate, mapQuote, mapTransfer, orient } from '@/server/adapters/airwallex/mappers';
import { MAX_REQUEST_ID_LENGTH, transferRequestId } from '@/server/adapters/airwallex/requestIds';
import { transitionTransfer } from '@/server/adapters/airwallex/endpoints/simulation';
import { isRecord } from '@/server/adapters/airwallex/values';
import { EnvError, parseEnv } from '@/server/env';
import { createLogger } from '@/server/logging/logger';
import { ensureBeneficiary } from './airwallex/beneficiary';
import { draftPlan } from './airwallex/drafts';
import { FixtureLog } from './airwallex/fixtures';
import { blockingFailed, renderResults, writeResults, type CheckResult } from './airwallex/results';

const FAILURE_TYPES = [
  'INVALID_ACCOUNT_NAME_OR_NUMBER',
  'INVALID_BANK_INFORMATION',
  'INVALID_BANK_OR_BRANCH_CODE',
  'INVALID_BENEFICIARY_DETAILS',
  'INVALID_SWIFT_BIC_CODE',
  'INVALID_CORRESPONDENT_BANK_INFORMATION',
  'BENEFICIARY_NAME_MISMATCH',
  'INVALID_SPECIAL_CHARACTER',
  'ACCOUNT_CURRENCY_MISMATCH',
  'ACCOUNT_CLOSED',
  'ACCOUNT_INACTIVE_OR_DORMANT',
  'ACCOUNT_UNDER_RESTRICTION',
  'BENEFICIARY_BANK_RETURNED',
  'BENEFICIARY_REQUESTED',
  'RECALL_REQUESTED',
  'DUPLICATION_RETURN',
  'INSUFFICIENT_FUNDS',
  'EXCEEDED_TRANSACTION_AMOUNT_OR_LIMIT',
  'TRANSACTION_AMOUNT_NOT_COVERING_FEE',
  'TM_SUSPENDED',
  'INVALID_PAYMENT_PURPOSE',
  'CHANNEL_POLICY',
  'CLIENT_REQUESTED',
  'SYSTEM_ERROR',
  'CHANNEL_TIMEOUT',
  'CARD_ISSUER_ERROR',
  'UNABLE_TO_APPLY',
  'OTHER',
] as const;

const APP = 'fx-target-payment';

async function main(): Promise<number> {
  let env;
  try {
    env = parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvError) process.stderr.write(`${error.message}\n`);
    return 1;
  }
  if (!env.AIRWALLEX_CLIENT_ID || !env.AIRWALLEX_API_KEY) {
    process.stderr.write('Set AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY in .env before the smoke.\n');
    return 1;
  }
  if (env.AIRWALLEX_ENV !== 'sandbox') {
    process.stderr.write('airwallex:smoke refuses to run unless AIRWALLEX_ENV=sandbox.\n');
    return 1;
  }

  const clock = new SystemClock();
  const fixtures = new FixtureLog();
  const seen: Array<{ path: string; version: string | null }> = [];
  let logins = 0;
  let bearer = '';
  const client = new AirwallexClient({
    baseUrl: env.AIRWALLEX_BASE_URL,
    filesBaseUrl: env.AIRWALLEX_FILES_BASE_URL,
    apiVersion: env.AIRWALLEX_API_VERSION,
    clientId: env.AIRWALLEX_CLIENT_ID,
    apiKey: env.AIRWALLEX_API_KEY,
    loginAs: env.AIRWALLEX_LOGIN_AS,
    envName: 'sandbox',
    flags: { spend: false, files: false },
    clock,
    logger: createLogger({ level: 'silent' }),
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      if (url.pathname.endsWith('/authentication/login')) logins += 1;
      const authorization = headers.get('authorization');
      if (authorization?.startsWith('Bearer ')) bearer = authorization.slice('Bearer '.length);
      seen.push({ path: url.pathname, version: headers.get('x-api-version') });
      return fetch(input, init);
    },
  });

  const checks: CheckResult[] = [];
  const notes = [
    'B2.3 live webhook delivery skipped: AIRWALLEX_WEBHOOK_SECRET is empty and no tunnel URL was provided. Signature checks stay in the unit tests.',
    env.AIRWALLEX_GLOBAL_ACCOUNT_ID
      ? 'Global account id is set.'
      : 'V13 stays blocked until AIRWALLEX_GLOBAL_ACCOUNT_ID is set.',
  ];
  const attempt = Math.floor(clock.now().getTime() / 60_000) % 100_000;

  async function run(id: string, fn: () => Promise<Omit<CheckResult, 'id'>>): Promise<void> {
    try {
      const result = await fn();
      checks.push({ id, ...result });
    } catch (error) {
      checks.push({ id, status: 'fail', detail: describe(error) });
    }
  }

  await run('V1', async () => {
    await client.request({
      method: 'GET',
      path: '/fx/rates/current',
      query: { buy_currency: 'EUR', sell_currency: 'USD', buy_amount: '10.00' },
    });
    await client.request({ method: 'GET', path: '/beneficiaries' });
    await client.request({ method: 'GET', path: '/transfers' });
    await client.request({
      method: 'GET',
      path: '/fx/rates/current',
      query: { buy_currency: 'EUR', sell_currency: 'USD', buy_amount: '10.00' },
    });
    const versioned = seen.filter((call) =>
      ['/fx/rates/current', '/beneficiaries', '/transfers'].some((path) => call.path.endsWith(path)),
    );
    const wrong = versioned.filter((call) => call.version !== env.AIRWALLEX_API_VERSION);
    if (logins !== 1) return { status: 'fail', detail: `login ran ${logins} times; expected one cached token` };
    if (wrong.length > 0) {
      return { status: 'fail', detail: `version header was ${wrong[0]?.version ?? 'missing'}` };
    }
    return {
      status: 'pass',
      detail: `one login; x-api-version ${env.AIRWALLEX_API_VERSION} on rates, beneficiaries and transfers`,
    };
  });

  await run('V2', async () => {
    const body = await client.request({
      method: 'GET',
      path: '/fx/rates/current',
      query: { buy_currency: 'EUR', sell_currency: 'USD', buy_amount: '10000.00' },
    });
    await fixtures.save('v2-rates-current', body, { kind: 'rate', buyCurrency: 'EUR' });
    const mapped = mapCurrentRate(body, 'EUR');
    return { status: 'pass', detail: `CLIENT price ${mapped.price} for buy 10000 EUR` };
  });

  let eurBeneficiary = '';
  let inrBeneficiary = '';
  await run('setup', async () => {
    const notes: string[] = [];
    for (const currency of ['EUR', 'INR'] as const) {
      const plan = draftPlan(currency);
      try {
        const created = await ensureBeneficiary(client, plan.draft, plan.requestKey, plan.keyword);
        if (currency === 'EUR') eurBeneficiary = created.id;
        else inrBeneficiary = created.id;
        await fixtures.save(`beneficiary-${currency.toLowerCase()}`, created.created, {
          kind: 'beneficiary',
          currency,
        });
        notes.push(`${currency} ${created.id}`);
      } catch (error) {
        notes.push(`${currency} ${describe(error)}`);
      }
    }
    if (!eurBeneficiary || !inrBeneficiary) return { status: 'fail', detail: notes.join('; ') };
    return { status: 'pass', detail: notes.join('; ') };
  });

  let expiryQuote: { id: string; validTo: string } | undefined;
  await run('V5-quote', async () => {
    const locked = await lockQuote(client, fixtures, 'v5-quote', 'EUR', 'USD', '10.00');
    expiryQuote = { id: locked.summary.airwallexQuoteId, validTo: locked.summary.validToAt };
    return { status: 'recorded', detail: `quote ${expiryQuote.id} valid to ${expiryQuote.validTo}` };
  });

  let paidTransfer = '';
  await run('V4', async () => {
    if (!eurBeneficiary) return { status: 'fail', detail: 'EUR beneficiary was not created' };
    const locked = await lockQuote(client, fixtures, 'v4-quote', 'EUR', 'USD', '10.00');
    const created = await createRawTransfer(client, fixtures, 'v4-transfer', {
      billId: 'smoke-v4',
      attempt,
      beneficiaryId: eurBeneficiary,
      amount: '10.00',
      currency: 'EUR',
      method: 'LOCAL',
      quoteId: locked.summary.airwallexQuoteId,
    });
    paidTransfer = created.id;
    if (created.mapperError) return { status: 'fail', detail: `transfer ${created.id} mapper: ${created.mapperError}` };
    const matched = samePrice(locked.body, created.body, 'EUR', 'USD');
    if (!matched) {
      return { status: 'fail', detail: `transfer ${created.id} rate does not match the quote` };
    }
    return { status: 'pass', detail: `transfer ${created.id} ${created.status}; conversion rate matches the quote` };
  });

  await run('V9', async () => {
    if (!inrBeneficiary) return { status: 'fail', detail: 'INR beneficiary was not created' };
    const locked = await lockQuote(client, fixtures, 'v9-quote', 'INR', 'USD', '1000.00');
    const created = await createRawTransfer(client, fixtures, 'v9-transfer', {
      billId: 'smoke-v9',
      attempt,
      beneficiaryId: inrBeneficiary,
      amount: '1000.00',
      currency: 'INR',
      method: 'LOCAL',
      quoteId: locked.summary.airwallexQuoteId,
    });
    return { status: 'pass', detail: `INR transfer ${created.id} ${created.status}` };
  });

  await run('V3', async () => {
    const locked = await lockQuote(client, fixtures, 'v3-quote', 'EUR', 'USD', '10.00');
    try {
      const body = await client.request({
        method: 'POST',
        path: '/fx/conversions/create',
        body: {
          request_id: `cv:smoke-v3:${attempt}`.slice(0, MAX_REQUEST_ID_LENGTH),
          buy_currency: 'EUR',
          buy_amount: '10.00',
          sell_currency: 'USD',
          quote_id: locked.summary.airwallexQuoteId,
        },
      });
      await fixtures.save('v3-conversion', body, { kind: 'conversion' });
      const id = isRecord(body) && typeof body.conversion_id === 'string' ? body.conversion_id : 'created';
      return { status: 'pass', detail: `POST /fx/conversions/create accepted (${id})` };
    } catch (error) {
      if (error instanceof AirwallexError && error.status === 404) throw error;
      await saveError(fixtures, 'v3-conversion-error', error);
      return { status: 'pass', detail: `path /fx/conversions/create responded: ${describe(error)}` };
    }
  });

  const future = await futureWeekday(client);
  await run('V6', async () => {
    if (!eurBeneficiary) return { status: 'fail', detail: 'EUR beneficiary was not created' };
    const created = await createRawTransfer(client, fixtures, 'v6-transfer', {
      billId: 'smoke-v6',
      attempt,
      beneficiaryId: eurBeneficiary,
      amount: '10.00',
      currency: 'EUR',
      method: 'LOCAL',
      transferDate: future,
      lockRate: false,
    });
    const cancelled = await client.request({
      method: 'POST',
      path: `/transfers/${created.id}/cancel`,
    });
    await fixtures.save('v6-cancel', cancelled, { kind: 'transfer' });
    return {
      status: 'recorded',
      detail: `future ${future} lock_rate_on_create=false created ${created.id} fee ${created.fee} then cancel ${describeStatus(cancelled)}`,
    };
  });

  await run('V7', async () => {
    if (!eurBeneficiary) return { status: 'fail', detail: 'EUR beneficiary was not created' };
    const locked = await lockQuote(client, fixtures, 'v7-quote', 'EUR', 'USD', '10.00');
    try {
      const created = await createRawTransfer(client, fixtures, 'v7-transfer', {
        billId: 'smoke-v7',
        attempt,
        beneficiaryId: eurBeneficiary,
        amount: '10.00',
        currency: 'EUR',
        method: 'LOCAL',
        quoteId: locked.summary.airwallexQuoteId,
        transferDate: future,
        lockRate: true,
      });
      return { status: 'recorded', detail: `quote_id with transfer_date ${future} accepted: ${created.id} ${created.status}` };
    } catch (error) {
      await saveError(fixtures, 'v7-error', error);
      return { status: 'recorded', detail: `quote_id with transfer_date rejected: ${describe(error)}` };
    }
  });

  await run('V17', async () => {
    const swift = draftPlan('EUR', 'SWIFT');
    const beneficiary = await ensureBeneficiary(client, swift.draft, swift.requestKey, swift.keyword);
    const payer = await createRawTransfer(client, fixtures, 'v17-payer', {
      billId: 'smoke-v17p',
      attempt,
      beneficiaryId: beneficiary.id,
      amount: '20.00',
      currency: 'EUR',
      method: 'SWIFT',
      swiftCharge: 'PAYER',
    });
    const shared = await createRawTransfer(client, fixtures, 'v17-shared', {
      billId: 'smoke-v17s',
      attempt,
      beneficiaryId: beneficiary.id,
      amount: '20.00',
      currency: 'EUR',
      method: 'SWIFT',
      swiftCharge: 'SHARED',
    });
    return {
      status: 'recorded',
      detail: `PAYER fee ${payer.fee} payer_pays ${payer.payerPays}; SHARED fee ${shared.fee} payer_pays ${shared.payerPays}`,
    };
  });

  await run('V14', async () => {
    const plan = draftPlan('KES');
    let beneficiaryId = '';
    try {
      const beneficiary = await ensureBeneficiary(client, plan.draft, plan.requestKey, plan.keyword);
      beneficiaryId = beneficiary.id;
    } catch (error) {
      return { status: 'recorded', detail: `KES beneficiary was not accepted: ${describe(error)}` };
    }
    const fractional = await validateAmount(client, beneficiaryId, '100.50');
    const whole = await validateAmount(client, beneficiaryId, '100');
    await fixtures.save('v14-kes', { fractional, whole }, { kind: 'validate' });
    return { status: 'recorded', detail: `100.50 KES: ${fractional}; 100 KES: ${whole}` };
  });

  await run('V16', async () => {
    const results: string[] = [];
    for (const currency of ['EUR', 'GBP'] as const) {
      const plan = draftPlan(currency);
      const beneficiary = await ensureBeneficiary(client, plan.draft, plan.requestKey, plan.keyword);
      try {
        const body = await client.request({
          method: 'POST',
          path: '/beneficiaries/verify_account',
          body: {
            entity_type: 'COMPANY',
            transfer_method: plan.draft.transferMethod,
            bank_details: bankDetailsOf(beneficiary.body),
          },
        });
        await fixtures.save(`v16-${currency.toLowerCase()}`, body, { kind: 'verification', currency });
        const code = isRecord(body) && typeof body.code === 'string' ? body.code : 'ok';
        results.push(`${currency} ${code}`);
      } catch (error) {
        await saveError(fixtures, `v16-${currency.toLowerCase()}-error`, error);
        results.push(`${currency} ${describe(error)}`);
      }
    }
    return { status: 'recorded', detail: results.join('; ') };
  });

  await run('V15', async () => {
    if (!eurBeneficiary) return { status: 'fail', detail: 'EUR beneficiary was not created' };
    const recorded: string[] = [];
    for (const [index, failureType] of FAILURE_TYPES.entries()) {
      try {
        const locked = await lockQuote(client, fixtures, `v15-${failureType.toLowerCase()}-quote`, 'EUR', 'USD', '2.00');
        const created = await createRawTransfer(client, fixtures, `v15-${failureType.toLowerCase()}`, {
          billId: `v15-${index}`,
          attempt,
          beneficiaryId: eurBeneficiary,
          amount: '2.00',
          currency: 'EUR',
          method: 'LOCAL',
          quoteId: locked.summary.airwallexQuoteId,
        });
        await transitionTransfer(client, created.id, { nextStatus: 'FAILED', failureType });
        await sleep(1500);
        const after = await client.request({ method: 'GET', path: `/transfers/${created.id}` });
        await fixtures.save(`v15-${failureType.toLowerCase()}-after`, after, { kind: 'transfer', failureType });
        const failure = isRecord(after) && isRecord(after.failure) ? JSON.stringify(after.failure) : 'none';
        const status = isRecord(after) && typeof after.status === 'string' ? after.status : 'unknown';
        recorded.push(`${failureType}: ${status} ${failure}`);
      } catch (error) {
        recorded.push(`${failureType}: ${describe(error)}`);
        if (error instanceof AirwallexError && error.code === 'balance_insufficient') break;
      }
    }
    return { status: 'recorded', detail: recorded.join(' | ') };
  });

  await run('V5', async () => {
    if (!expiryQuote) return { status: 'fail', detail: 'expiry quote was not locked' };
    if (!eurBeneficiary) return { status: 'fail', detail: 'EUR beneficiary was not created' };
    const wait = Date.parse(expiryQuote.validTo) - Date.now() + 2_000;
    if (wait > 0 && wait < 180_000) await sleep(wait);
    try {
      await createRawTransfer(client, fixtures, 'v5-transfer', {
        billId: 'smoke-v5',
        attempt,
        beneficiaryId: eurBeneficiary,
        amount: '10.00',
        currency: 'EUR',
        method: 'LOCAL',
        quoteId: expiryQuote.id,
      });
      return { status: 'fail', detail: 'expired quote was accepted' };
    } catch (error) {
      await saveError(fixtures, 'v5-error', error);
      if (error instanceof AirwallexError && (error.code === 'quote_expired' || error.providerCode === 'expired_quote')) {
        return { status: 'pass', detail: `${error.providerCode} after ${expiryQuote.validTo}` };
      }
      return { status: 'fail', detail: describe(error) };
    }
  });

  await run('V8', async () => {
    if (!paidTransfer) return { status: 'fail', detail: 'no transfer to advance' };
    const steps = ['PROCESSING', 'SENT', 'PAID'] as const;
    let status = await transferStatus(client, paidTransfer);
    for (const next of steps) {
      if (status === next || rank(status) > rank(next)) continue;
      await transitionTransfer(client, paidTransfer, { nextStatus: next });
      status = await transferStatus(client, paidTransfer);
    }
    await fixtures.save('v8-paid', { id: paidTransfer, status }, { kind: 'simulation' });
    if (status !== 'PAID') return { status: 'fail', detail: `ended at ${status}` };
    return {
      status: 'pass',
      detail: `${paidTransfer} reached PAID. Webhook delivery was not checked (no secret, no tunnel).`,
    };
  });

  await run('V10', async () => {
    if (!bearer) return { status: 'fail', detail: 'no bearer token' };
    const statuses: number[] = [];
    for (let index = 0; index < 24; index += 1) {
      const started = Date.now();
      const response = await fetch(
        airwallexUrl(env.AIRWALLEX_BASE_URL, '/fx/rates/current', {
          buy_currency: 'EUR',
          sell_currency: 'USD',
          buy_amount: '10.00',
        }),
        {
          headers: {
            authorization: `Bearer ${bearer}`,
            'x-api-version': env.AIRWALLEX_API_VERSION,
          },
        },
      );
      statuses.push(response.status);
      await response.text();
      const pause = 125 - (Date.now() - started);
      if (pause > 0) await sleep(pause);
    }
    const limited = statuses.filter((status) => status === 429).length;
    return {
      status: 'recorded',
      detail: `24 calls at ~8/s; ${limited} returned 429; statuses ${summariseStatuses(statuses)}`,
    };
  });

  checks.push({
    id: 'V12',
    status: 'blocked',
    detail: 'run pnpm seed:beneficiaries',
  });
  checks.push({
    id: 'V13',
    status: 'blocked',
    detail: env.AIRWALLEX_GLOBAL_ACCOUNT_ID
      ? 'run pnpm seed:beneficiaries'
      : 'AIRWALLEX_GLOBAL_ACCOUNT_ID is empty',
  });

  try {
    const account = await client.request({ method: 'GET', path: '/account' });
    await fixtures.save('account', account, { kind: 'account' });
    notes.push(
      'GET /account returned a US business with a Los Angeles, CA registration address and no timezone field.',
    );
  } catch (error) {
    notes.push(`GET /account: ${describe(error)}`);
  }

  const markdown = renderResults({ ranAt: clock.now().toISOString(), notes, checks });
  await writeResults(markdown);
  for (const check of checks) {
    process.stdout.write(`${check.id.padEnd(8)} ${check.status.padEnd(9)} ${check.detail}\n`);
  }
  const failed = blockingFailed(checks);
  if (failed.length > 0) {
    process.stderr.write(`Blocking checks failed: ${failed.map((check) => check.id).join(', ')}\n`);
    return 1;
  }
  return 0;
}

async function lockQuote(
  client: AirwallexClient,
  fixtures: FixtureLog,
  name: string,
  buy: string,
  sell: string,
  amount: string,
) {
  const body = await client.request({
    method: 'POST',
    path: '/fx/quotes/create',
    body: {
      buy_currency: buy,
      buy_amount: jsonNumber(amount),
      sell_currency: sell,
      validity: 'MIN_1',
    },
  });
  await fixtures.save(name, body, { kind: 'quote', buyCurrency: buy, sellCurrency: sell });
  return { body, summary: mapQuote(body) };
}

async function createRawTransfer(
  client: AirwallexClient,
  fixtures: FixtureLog,
  name: string,
  input: {
    billId: string;
    attempt: number;
    beneficiaryId: string;
    amount: string;
    currency: string;
    method: 'LOCAL' | 'SWIFT';
    quoteId?: string;
    transferDate?: string;
    lockRate?: boolean;
    swiftCharge?: 'PAYER' | 'SHARED';
  },
): Promise<{
  id: string;
  status: string;
  body: unknown;
  fee: string;
  payerPays: string;
  mapperError?: string;
}> {
  const requestId = transferRequestId(input.billId, input.attempt);
  const payload: Record<string, unknown> = {
    request_id: requestId,
    beneficiary_id: input.beneficiaryId,
    transfer_currency: input.currency,
    transfer_amount: input.amount,
    source_currency: 'USD',
    transfer_method: input.method,
    reason: 'bill_payment',
    reference: input.billId,
    fee_paid_by: 'PAYER',
    metadata: { bill_id: input.billId, app: APP },
  };
  if (input.quoteId) payload.quote_id = input.quoteId;
  if (input.method === 'SWIFT') payload.swift_charge_option = input.swiftCharge ?? 'PAYER';
  if (input.transferDate) {
    payload.transfer_date = input.transferDate;
    payload.lock_rate_on_create = input.lockRate ?? false;
  }
  try {
    const body = await client.request({ method: 'POST', path: '/transfers/create', body: payload });
    await fixtures.save(name, body, { kind: 'transfer' });
    const summary: {
      id: string;
      status: string;
      body: unknown;
      fee: string;
      payerPays: string;
      mapperError?: string;
    } = { ...summariseTransfer(body), body };
    try {
      mapTransfer(body, 'MANUAL');
    } catch (error) {
      summary.mapperError = describe(error);
    }
    return summary;
  } catch (error) {
    await saveError(fixtures, `${name}-error`, error);
    throw error;
  }
}

function summariseTransfer(body: unknown): { id: string; status: string; fee: string; payerPays: string } {
  if (!isRecord(body) || typeof body.id !== 'string') throw new Error('transfer response has no id');
  return {
    id: body.id,
    status: typeof body.status === 'string' ? body.status : 'unknown',
    fee: typeof body.fee_amount === 'string' ? body.fee_amount : String(body.fee_amount ?? 'n/a'),
    payerPays:
      typeof body.amount_payer_pays === 'string'
        ? body.amount_payer_pays
        : String(body.amount_payer_pays ?? 'n/a'),
  };
}

function samePrice(quote: unknown, transfer: unknown, buy: string, sell: string): boolean {
  if (!isRecord(quote) || !isRecord(transfer) || !isRecord(transfer.conversion)) return false;
  if (typeof quote.client_rate !== 'string' || typeof quote.currency_pair !== 'string') return false;
  const conversion = transfer.conversion;
  if (typeof conversion.rate !== 'string' || typeof conversion.currency_pair !== 'string') return false;
  const left = orient(quote.client_rate, quote.currency_pair, buy, sell);
  const right = orient(conversion.rate, conversion.currency_pair, buy, sell);
  return new Decimal(left).eq(right);
}

async function validateAmount(client: AirwallexClient, beneficiaryId: string, amount: string): Promise<string> {
  try {
    await client.request({
      method: 'POST',
      path: '/transfers/validate',
      body: {
        beneficiary_id: beneficiaryId,
        transfer_currency: 'KES',
        transfer_amount: amount,
        source_currency: 'USD',
        transfer_method: 'LOCAL',
        reason: 'bill_payment',
        reference: 'kes-precision',
        fee_paid_by: 'PAYER',
        request_id: `tr:smoke-kes-${amount.replace('.', '')}:1`,
      },
    });
    return 'accepted';
  } catch (error) {
    return describe(error);
  }
}

async function futureWeekday(client: AirwallexClient): Promise<string> {
  let skipped = new Set<string>();
  try {
    const days = await client.request({
      method: 'GET',
      path: '/reference/invalid_conversion_dates',
      query: { currency_pair: 'EURUSD' },
    });
    if (Array.isArray(days)) {
      skipped = new Set(
        days
          .filter((day) => isRecord(day) && typeof day.date === 'string')
          .map((day) => (day as { date: string }).date),
      );
    }
  } catch {
    skipped = new Set();
  }
  for (let add = 14; add < 60; add += 1) {
    const date = new Date(Date.now() + add * 86_400_000);
    const iso = isoDate(date, 'America/Los_Angeles');
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'short',
    }).format(date);
    if (weekday === 'Sat' || weekday === 'Sun' || skipped.has(iso)) continue;
    return iso;
  }
  return isoDate(new Date(Date.now() + 21 * 86_400_000), 'America/Los_Angeles');
}

function isoDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function transferStatus(client: AirwallexClient, id: string): Promise<string> {
  const body = await client.request({ method: 'GET', path: `/transfers/${id}` });
  return isRecord(body) && typeof body.status === 'string' ? body.status : 'unknown';
}

function rank(status: string): number {
  const order = ['SCHEDULED', 'OVERDUE', 'PROCESSING', 'SENT', 'PAID'];
  const index = order.indexOf(status);
  return index === -1 ? -1 : index;
}

function summariseStatuses(statuses: number[]): string {
  const counts = new Map<number, number>();
  for (const status of statuses) counts.set(status, (counts.get(status) ?? 0) + 1);
  return [...counts.entries()].map(([status, count]) => `${status}x${count}`).join(', ');
}

async function saveError(fixtures: FixtureLog, name: string, error: unknown): Promise<void> {
  if (!(error instanceof AirwallexError)) return;
  await fixtures.save(name, {
    status: error.status,
    code: error.providerCode,
    message: error.message,
    details: error.details,
    fieldErrors: error.fieldErrors,
  });
}

function bankDetailsOf(body: Record<string, unknown>): Record<string, unknown> {
  const beneficiary = isRecord(body.beneficiary) ? body.beneficiary : undefined;
  const bank = beneficiary && isRecord(beneficiary.bank_details) ? beneficiary.bank_details : undefined;
  if (!bank) throw new Error('beneficiary body has no bank_details');
  return bank;
}

function describe(error: unknown): string {
  if (error instanceof AirwallexError) {
    const fields = error.fieldErrors?.map((field) => `${field.path}:${field.code}`).join(', ');
    return `${error.status} ${error.providerCode}: ${error.message}${fields ? ` [${fields}]` : ''}`;
  }
  return error instanceof Error ? error.message : 'unknown error';
}

function describeStatus(body: unknown): string {
  return isRecord(body) && typeof body.status === 'string' ? body.status : 'ok';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'smoke failed'}\n`);
    process.exit(1);
  },
);
