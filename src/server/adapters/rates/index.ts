import type { RateSourceKind } from '@/contracts/sse';
import { createAirwallexClient } from '@/server/adapters/airwallex/client';
import { getCurrentRate } from '@/server/adapters/airwallex/endpoints/rates';
import { DEMO_ANCHORS, SimulatedMarket } from '@/mocks/market';
import type { Env } from '@/server/env';
import { createLogger } from '@/server/logging/logger';

export interface IndicativeRequest {
  buy: string;
  sell: string;
  buyAmount: string;
}

export interface IndicativeRate {
  price: string;
  source: Extract<RateSourceKind, 'AIRWALLEX' | 'SIMULATED'>;
}

export interface RateSource {
  /** Advance a simulated market once per poll. Airwallex has nothing to prepare. */
  prepare?(nowMs: number): void;
  getIndicative(input: IndicativeRequest): Promise<IndicativeRate>;
}

export async function createRateSource(env: Env): Promise<RateSource> {
  if (env.RATE_SOURCE === 'airwallex') return airwallexRates(env);
  const pairs = DEMO_ANCHORS.map((pair) => ({ ...pair }));
  const eur = pairs.find((pair) => pair.base === 'EUR' && pair.quote === 'USD');
  if (eur && env.AIRWALLEX_CLIENT_ID && env.AIRWALLEX_API_KEY) {
    try {
      const rate = await getCurrentRate(clientFor(env), {
        buyCurrency: 'EUR',
        sellCurrency: 'USD',
        buyAmount: '1000',
      });
      eur.price = rate.price;
    } catch {
      // DEMO-ONLY: keep the seeded anchor when the sandbox rate is unavailable.
      // PROD: RATE_SOURCE=airwallex, so there is no simulated anchor.
    }
  }
  return simulatedRates(new SimulatedMarket(1, pairs, env.POLL_INTERVAL_MS));
}

function clientFor(env: Env) {
  if (!env.AIRWALLEX_CLIENT_ID || !env.AIRWALLEX_API_KEY) {
    throw new Error('Airwallex credentials are not set');
  }
  return createAirwallexClient(env, { logger: createLogger({ level: 'silent' }) });
}

function airwallexRates(env: Env): RateSource {
  return {
    async getIndicative(input) {
      const rate = await getCurrentRate(clientFor(env), {
        buyCurrency: input.buy,
        sellCurrency: input.sell,
        buyAmount: input.buyAmount,
      });
      return { price: rate.price, source: 'AIRWALLEX' };
    },
  };
}

function simulatedRates(market: SimulatedMarket): RateSource {
  return {
    prepare(nowMs) {
      market.step(nowMs);
    },
    async getIndicative(input) {
      let price: string;
      try {
        price = market.price(input.buy, input.sell);
      } catch {
        price = '1';
      }
      return { price, source: 'SIMULATED' };
    },
  };
}
