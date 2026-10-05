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
  /** When set, a running Simulate overrides the configured source for this bill. */
  billId?: string;
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

let activeMarket: SimulatedMarket | null = null;

export function activeSimulatedMarket(): SimulatedMarket | null {
  return activeMarket;
}

/**
 * Per-bill prices for a Simulate run. Every other request uses the inner source.
 */
export function routingRateSource(
  inner: RateSource,
  scripted: (billId: string) => Promise<string | null>,
): RateSource {
  return {
    prepare: (nowMs) => inner.prepare?.(nowMs),
    async getIndicative(input) {
      if (input.billId) {
        const price = await scripted(input.billId);
        if (price) return { price, source: 'SIMULATED' };
      }
      return inner.getIndicative(input);
    },
  };
}

export async function createRateSource(env: Env): Promise<RateSource> {
  if (env.RATE_SOURCE === 'airwallex') {
    activeMarket = null;
    return airwallexRates(env);
  }
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
  const market = new SimulatedMarket(1, pairs, env.POLL_INTERVAL_MS);
  activeMarket = market;
  return simulatedRates(market);
}

function clientFor(env: Env) {
  if (!env.AIRWALLEX_CLIENT_ID || !env.AIRWALLEX_API_KEY) {
    throw new Error('Airwallex credentials are not set');
  }
  return createAirwallexClient(env, {
    logger: createLogger({ level: 'silent' }),
  });
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
