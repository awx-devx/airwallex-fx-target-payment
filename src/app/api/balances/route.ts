import { getCurrentBalances } from '@/server/adapters/airwallex/endpoints/balances';
import { AirwallexClient } from '@/server/adapters/airwallex/client';
import { SystemClock } from '@/server/adapters/clock';
import { MockPaymentsGateway } from '@/server/adapters/mock/gateway';
import { getEnv, type Env } from '@/server/env';
import { createLogger } from '@/server/logging/logger';
import { failureResponse, json } from '@/server/http/respond';
import { balanceEpoch } from '@/server/services/balanceCache';
import { readBalances, type BalanceSource } from '@/server/services/balances';
import { ServiceError } from '@/server/services/errors';
import type { BalanceSummary } from '@/contracts/airwallex';

export const runtime = 'nodejs';

let cache: { at: number; epoch: string; rows: BalanceSummary[] } | null = null;

export async function GET(): Promise<Response> {
  try {
    const env = getEnv();
    const clock = new SystemClock();
    const epoch = await balanceEpoch(env.REDIS_URL);
    const fresh = cache?.epoch === epoch ? cache : null;
    const result = await readBalances({
      source: gatewayFor(env),
      clock,
      cache: fresh,
    });
    cache = { ...result.cache, epoch };
    return json(result.rows);
  } catch (error) {
    return failureResponse(error);
  }
}

function gatewayFor(env: Env): BalanceSource {
  const clock = new SystemClock();
  if (env.PAYMENTS_GATEWAY === 'mock') {
    return new MockPaymentsGateway({ clock, latencyMs: { getBalances: 0 } });
  }
  if (!env.AIRWALLEX_CLIENT_ID || !env.AIRWALLEX_API_KEY) {
    throw new ServiceError('AIRWALLEX_CONFIG', 'Airwallex credentials are not set', 503);
  }
  const client = new AirwallexClient({
    baseUrl: env.AIRWALLEX_BASE_URL,
    filesBaseUrl: env.AIRWALLEX_FILES_BASE_URL,
    apiVersion: env.AIRWALLEX_API_VERSION,
    clientId: env.AIRWALLEX_CLIENT_ID,
    apiKey: env.AIRWALLEX_API_KEY,
    loginAs: env.AIRWALLEX_LOGIN_AS,
    envName: env.AIRWALLEX_ENV,
    flags: { spend: env.SPEND_SYNC, files: env.FILES_UPLOAD },
    clock,
    logger: createLogger({ level: 'silent' }),
  });
  return { getBalances: () => getCurrentBalances(client) };
}
