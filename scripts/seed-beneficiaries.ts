import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SystemClock } from '@/server/adapters/clock';
import { AirwallexClient } from '@/server/adapters/airwallex/client';
import { createDeposit } from '@/server/adapters/airwallex/endpoints/simulation';
import { EnvError, parseEnv } from '@/server/env';
import { createLogger } from '@/server/logging/logger';
import { ensureBeneficiary } from './airwallex/beneficiary';
import { draftPlan } from './airwallex/drafts';
import { FixtureLog } from './airwallex/fixtures';
import { type CheckStatus } from './airwallex/results';

const CURRENCIES = ['EUR', 'GBP', 'JPY', 'SGD', 'INR'] as const;
const RESULTS = path.resolve(process.cwd(), 'docs/verification-results.md');

async function main(): Promise<number> {
  let env;
  try {
    env = parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvError) process.stderr.write(`${error.message}\n`);
    return 1;
  }
  if (!env.DEMO_MODE || env.AIRWALLEX_ENV !== 'sandbox') {
    process.stderr.write('seed:beneficiaries requires DEMO_MODE=true and AIRWALLEX_ENV=sandbox.\n');
    return 1;
  }
  if (!env.AIRWALLEX_CLIENT_ID || !env.AIRWALLEX_API_KEY) {
    process.stderr.write('Set AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY in .env.\n');
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
  const fixtures = new FixtureLog();
  const pooled: Array<Record<string, string>> = [];
  const v12: string[] = [];

  for (const currency of CURRENCIES) {
    const plan = draftPlan(currency);
    try {
      const beneficiary = await ensureBeneficiary(client, plan.draft, plan.requestKey, plan.keyword);
      pooled.push({
        currency,
        country: plan.draft.country,
        method: plan.draft.transferMethod,
        id: beneficiary.id,
        requestId: beneficiary.requestId,
        routingValue: plan.draft.routingValue1 ?? '',
        swift: plan.draft.bic ?? '',
        bankName: plan.draft.bankName ?? '',
      });
      v12.push(
        `${currency} ${plan.draft.transferMethod} accepted id ${beneficiary.id} bank ${plan.draft.bic ?? plan.draft.routingValue1 ?? 'iban'}`,
      );
      process.stdout.write(`${currency} ${beneficiary.id}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed';
      v12.push(`${currency} rejected: ${message}`);
      process.stdout.write(`${currency} rejected: ${message}\n`);
    }
  }
  await fixtures.save('v12-beneficiaries', pooled, { kind: 'allowlist' });

  let v13Status: CheckStatus = 'blocked';
  let v13Detail = 'AIRWALLEX_GLOBAL_ACCOUNT_ID is empty';
  if (env.AIRWALLEX_GLOBAL_ACCOUNT_ID) {
    try {
      const deposit = await createDeposit(client, {
        globalAccountId: env.AIRWALLEX_GLOBAL_ACCOUNT_ID,
        amount: '100.00',
      });
      await fixtures.save('v13-deposit', deposit, { kind: 'deposit' });
      v13Status = 'pass';
      v13Detail = 'deposit simulation accepted 100.00 USD';
    } catch (error) {
      v13Status = 'fail';
      v13Detail = error instanceof Error ? error.message : 'deposit failed';
    }
  }
  process.stdout.write(`V13 ${v13Status} ${v13Detail}\n`);

  const existing = await readFile(RESULTS, 'utf8').catch(() => '');
  const next = replaceRow(
    replaceRow(existing, 'V12', v12.every((line) => line.includes('accepted')) ? 'pass' : 'recorded', v12.join(' | ')),
    'V13',
    v13Status,
    v13Detail,
  );
  await writeFile(RESULTS, next.endsWith('\n') ? next : `${next}\n`);
  return v12.some((line) => line.includes('accepted')) ? 0 : 1;
}

function replaceRow(markdown: string, id: string, status: CheckStatus, detail: string): string {
  const line = `| ${id} | ${status} | ${detail.replace(/\|/g, '/').replace(/\s+/g, ' ').trim()} |`;
  if (markdown.length === 0) {
    return `# Airwallex sandbox verification\n\n| ID | Result | Detail |\n| --- | --- | --- |\n${line}\n`;
  }
  const pattern = new RegExp(`^\\| ${id} \\|.*$`, 'm');
  if (pattern.test(markdown)) return markdown.replace(pattern, line);
  return `${markdown.trimEnd()}\n${line}\n`;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'seed failed'}\n`);
    process.exit(1);
  },
);
