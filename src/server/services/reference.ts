import type { CorridorQuota, NonConversionDay } from '@/contracts/airwallex';
import { CURRENCIES, type CurrencyInfo } from '@/contracts/currencies';
import {
  corridorQuota,
  invalidConversionDates,
  supportedCurrencies,
} from '@/server/adapters/airwallex/endpoints/reference';
import type { Env } from '@/server/env';
import { requireAirwallex } from '@/server/services/airwallexClient';
import { invalid } from '@/server/services/errors';
import { Redis } from 'ioredis';

const DAY_SECONDS = 86_400;

export interface ReferenceContext {
  env: Env;
  paymentsGateway: Env['PAYMENTS_GATEWAY'];
}

export async function listCurrencies(ctx: ReferenceContext): Promise<CurrencyInfo[]> {
  if (ctx.paymentsGateway === 'mock') return CURRENCIES.map((currency) => ({ ...currency }));
  const supported = await cached(ctx.env.REDIS_URL, 'ref:currencies', () =>
    supportedCurrencies(requireAirwallex(ctx.env)),
  );
  return CURRENCIES.map((currency) => ({
    ...currency,
    enabledOnAccount: {
      buy: supported.buy.includes(currency.code),
      sell: supported.sell.includes(currency.code),
    },
  }));
}

export async function listNonConversionDays(
  ctx: ReferenceContext,
  pair: string,
): Promise<NonConversionDay[]> {
  if (!/^[A-Z]{6}$/.test(pair)) throw invalid('pair must be six letters, like EURUSD');
  if (ctx.paymentsGateway === 'mock') return [];
  return cached(ctx.env.REDIS_URL, `ref:days:${pair}`, () =>
    invalidConversionDates(requireAirwallex(ctx.env), pair),
  );
}

export async function readQuota(
  ctx: ReferenceContext,
  type: CorridorQuota['type'],
): Promise<CorridorQuota> {
  if (ctx.paymentsGateway === 'mock') {
    return {
      type,
      available: '1000000000',
      currency: type === 'ID_OUTBOUND' ? 'IDR' : 'VND',
    };
  }
  return cached(ctx.env.REDIS_URL, `ref:quota:${type}`, () =>
    corridorQuota(requireAirwallex(ctx.env), type),
  );
}

/** Dates the deadline math should skip. A cache or provider miss leaves weekends only. */
export async function conversionSkipDates(
  ctx: ReferenceContext,
  billCurrency: string,
  homeCurrency: string,
): Promise<string[]> {
  if (ctx.paymentsGateway === 'mock') return [];
  try {
    const days = await listNonConversionDays(ctx, `${billCurrency}${homeCurrency}`);
    return days.map((day) => day.date);
  } catch {
    return [];
  }
}

let redis: Redis | undefined;

async function cached<T>(url: string, key: string, load: () => Promise<T>): Promise<T> {
  redis ??= new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  if (redis.status === 'wait') await redis.connect();
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit) as T;
  const value = await load();
  await redis.set(key, JSON.stringify(value), 'EX', DAY_SECONDS);
  return value;
}

export async function closeReferenceCache(): Promise<void> {
  const current = redis;
  redis = undefined;
  if (current) await current.quit();
}
