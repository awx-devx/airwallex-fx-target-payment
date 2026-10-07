import { AirwallexClient } from '@/server/adapters/airwallex/client';
import { AirwallexError } from '@/server/adapters/airwallex/errors';
import { createQuote } from '@/server/adapters/airwallex/endpoints/quotes';
import {
  transitionTransfer,
  type SimulationStatus,
} from '@/server/adapters/airwallex/endpoints/simulation';
import { createTransfer } from '@/server/adapters/airwallex/endpoints/transfers';
import { isRecord } from '@/server/adapters/airwallex/values';
import { SystemClock } from '@/server/adapters/clock';
import { EnvError, parseEnv } from '@/server/env';
import { createLogger } from '@/server/logging/logger';
import { draftPlan } from './airwallex/drafts';
import { ensureBeneficiary } from './airwallex/beneficiary';

/**
 * Re-checks V15 from SENT and from PAID, and whether V8 webhook delivery
 * can be checked. Run: node --env-file=.env --import tsx scripts/airwallex-failure-spike.ts
 * Sandbox only. Creates two small EUR transfers.
 */

const STEPS = {
  sent: ['PROCESSING', 'SENT', 'FAILED'],
  paid: ['PROCESSING', 'SENT', 'PAID', 'FAILED'],
} as const satisfies Record<string, readonly SimulationStatus[]>;

async function main(): Promise<number> {
  let env;
  try {
    env = parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvError) process.stderr.write(`${error.message}\n`);
    return 1;
  }
  if (!env.AIRWALLEX_CLIENT_ID || !env.AIRWALLEX_API_KEY) {
    process.stderr.write('Set AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY.\n');
    return 1;
  }
  if (env.AIRWALLEX_ENV !== 'sandbox') {
    process.stderr.write('Refusing to run unless AIRWALLEX_ENV=sandbox.\n');
    return 1;
  }

  const client = new AirwallexClient({
    baseUrl: env.AIRWALLEX_BASE_URL,
    filesBaseUrl: env.AIRWALLEX_FILES_BASE_URL,
    apiVersion: env.AIRWALLEX_API_VERSION,
    clientId: env.AIRWALLEX_CLIENT_ID,
    apiKey: env.AIRWALLEX_API_KEY,
    loginAs: env.AIRWALLEX_LOGIN_AS,
    envName: 'sandbox',
    flags: { spend: false, files: false },
    clock: new SystemClock(),
    logger: createLogger({ level: 'silent' }),
  });

  const beneficiaryId = await eurBeneficiary(client);
  const attempt = Math.max(1, Date.now() % 1_000_000);
  for (const from of ['sent', 'paid'] as const) {
    try {
      const line = await failFrom(client, beneficiaryId, from, attempt);
      process.stdout.write(`${line}\n`);
    } catch (error) {
      process.stdout.write(
        `V15 from ${from.toUpperCase()} failed before transition: ${describe(error)}\n`,
      );
    }
  }

  const webhook = env.AIRWALLEX_WEBHOOK_SECRET
    ? 'secret is set, but no tunnel is registered from this run'
    : 'blocked: AIRWALLEX_WEBHOOK_SECRET is empty, so a tunnel has nothing to verify';
  process.stdout.write(`V8 webhook: ${webhook}\n`);
  return 0;
}

async function eurBeneficiary(client: AirwallexClient): Promise<string> {
  const listed = await client.request({
    method: 'GET',
    path: '/beneficiaries',
  });
  const found = eurId(listed);
  if (found) return found;
  const plan = draftPlan('EUR');
  const created = await ensureBeneficiary(
    client,
    plan.draft,
    plan.requestKey,
    plan.keyword,
  );
  return created.id;
}

function eurId(payload: unknown): string | undefined {
  const items = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.items)
      ? payload.items
      : [];
  for (const item of items) {
    if (!isRecord(item) || typeof item.id !== 'string') continue;
    const beneficiary = isRecord(item.beneficiary)
      ? item.beneficiary
      : undefined;
    const bank =
      beneficiary && isRecord(beneficiary.bank_details)
        ? beneficiary.bank_details
        : undefined;
    const currency =
      bank && typeof bank.account_currency === 'string'
        ? bank.account_currency
        : '';
    const methods = Array.isArray(item.transfer_methods)
      ? item.transfer_methods
      : [];
    if (currency === 'EUR' && methods.includes('LOCAL')) return item.id;
  }
  return undefined;
}

async function failFrom(
  client: AirwallexClient,
  beneficiaryId: string,
  from: keyof typeof STEPS,
  attempt: number,
): Promise<string> {
  const quote = await createQuote(client, {
    buyCurrency: 'EUR',
    buyAmount: '10.00',
    sellCurrency: 'USD',
    validity: 'MIN_1',
  });
  const created = await createTransfer(client, {
    billId: `spk-${from}`,
    attempt,
    beneficiaryId,
    transferCurrency: 'EUR',
    transferAmount: quote.buyAmount,
    sourceCurrency: 'USD',
    transferMethod: 'LOCAL',
    quoteId: quote.airwallexQuoteId,
    reason: 'bill_payment',
    reference: `spk-${from}`,
    mode: 'TARGET',
  });
  const notes = [`create ${created.status}`];
  for (const next of STEPS[from]) {
    const before = await readTransfer(client, created.transferId);
    if (
      before.startsWith(next) ||
      before.startsWith('FAILED') ||
      before.startsWith('CANCELLED')
    ) {
      notes.push(`already ${before}`);
      if (before.startsWith('FAILED') || before.startsWith('CANCELLED')) break;
      continue;
    }
    try {
      await transitionTransfer(client, created.transferId, {
        nextStatus: next,
        ...(next === 'FAILED' ? { failureType: 'SYSTEM_ERROR' } : {}),
      });
      notes.push(
        `${next} -> ${await readTransfer(client, created.transferId)}`,
      );
    } catch (error) {
      const after = await readTransfer(client, created.transferId);
      notes.push(`${next} rejected (${describe(error)}); now ${after}`);
    }
  }
  await sleep(2000);
  notes.push(`later ${await readTransfer(client, created.transferId)}`);
  return `V15 from ${from.toUpperCase()} ${created.transferId}: ${notes.join(' | ')}`;
}

async function readTransfer(
  client: AirwallexClient,
  id: string,
): Promise<string> {
  const body = await client.request({
    method: 'GET',
    path: `/transfers/${id}`,
  });
  if (!isRecord(body)) return 'unreadable';
  const status = typeof body.status === 'string' ? body.status : 'unknown';
  if (!isRecord(body.failure)) return status;
  const code = typeof body.failure.code === 'string' ? body.failure.code : '';
  const message =
    typeof body.failure.message === 'string' ? body.failure.message : '';
  const details = isRecord(body.failure.details)
    ? body.failure.details
    : undefined;
  const type = details && typeof details.type === 'string' ? details.type : '';
  return `${status} failure code=${code} type=${type} message=${message}`;
}

function describe(error: unknown): string {
  if (error instanceof AirwallexError) {
    return `${error.status} ${error.providerCode}: ${error.message}`;
  }
  return error instanceof Error ? error.message : 'failed';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'spike failed'}\n`,
    );
    process.exit(1);
  },
);
