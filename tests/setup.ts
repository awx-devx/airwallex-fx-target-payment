import { inject } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
    redisUrl: string;
  }
}

function databaseUri(base: string, name: string): string {
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
}

const pool = process.env.VITEST_POOL_ID ?? '0';
const worker = process.env.VITEST_WORKER_ID ?? '0';

const testEnv: Record<string, string> = {
  MONGODB_URI: databaseUri(inject('mongoUri'), `fx_${pool}_${worker}`),
  REDIS_URL: inject('redisUrl'),
  HOME_CURRENCY: 'USD',
  DEMO_MODE: 'true',
  NEXT_PUBLIC_DATA_SOURCE: 'mock',
  AIRWALLEX_ENV: 'sandbox',
  AIRWALLEX_BASE_URL: 'https://api.sandbox.airwallex.com',
  AIRWALLEX_API_VERSION: '2026-08-21',
  AIRWALLEX_ACCOUNT_TZ: 'America/Los_Angeles',
  RATE_SOURCE: 'simulated',
  PAYMENTS_GATEWAY: 'mock',
  HISTORY_SOURCE: 'none',
  BILL_EXTRACTOR: 'mock',
  CLOCK: 'system',
  DEADLINE_SAFETY_NET: 'none',
  POLL_INTERVAL_MS: '10000',
  TRIGGER_CONFIRM_TICKS: '2',
  TRIGGER_BUFFER_BPS: '0',
  QUOTE_VALIDITY_TARGET: 'MIN_1',
  QUOTE_VALIDITY_DEADLINE: 'MIN_1',
  DEADLINE_AUTOSETTLE_CUTOFF: '14:00',
  RATE_TICKS_TTL_DAYS: '30',
};

for (const [key, value] of Object.entries(testEnv)) {
  process.env[key] = value;
}

delete process.env.AIRWALLEX_CLIENT_ID;
delete process.env.AIRWALLEX_API_KEY;
delete process.env.AIRWALLEX_WEBHOOK_SECRET;
delete process.env.ANTHROPIC_API_KEY;
