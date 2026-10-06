import { decimalString } from '@/contracts/money';
import { DEMO_ANCHORS } from '@/mocks/market';
import { createAirwallexClient } from '@/server/adapters/airwallex/client';
import { getCurrentRate } from '@/server/adapters/airwallex/endpoints/rates';
import { fromDecimal128 } from '@/server/db/decimal';
import { RateTick } from '@/server/db/models';
import type { Env } from '@/server/env';
import { createLogger } from '@/server/logging/logger';

/** Pair history. A Simulate session tick carries `meta.simId` and belongs to one bill. */
export function sharedPairTicks(pair: { base: string; quote: string }) {
  return {
    'meta.base': pair.base,
    'meta.quote': pair.quote,
    'meta.simId': { $exists: false },
  };
}

/**
 * The shared price for the pair: the latest tick that is not a Simulate session,
 * otherwise the sandbox indicative rate. The static demo anchor is only a fallback.
 */
export async function currentPairPrice(
  env: Env,
  pair: { base: string; quote: string },
): Promise<{ price: string; source: 'SIMULATED' | 'AIRWALLEX' }> {
  const tick = await RateTick.findOne(sharedPairTicks(pair)).sort({ ts: -1 }).lean();
  if (tick) {
    return {
      price: decimalString(fromDecimal128(tick.price)),
      source: tick.meta.source === 'AIRWALLEX' ? 'AIRWALLEX' : 'SIMULATED',
    };
  }
  if (env.AIRWALLEX_CLIENT_ID && env.AIRWALLEX_API_KEY) {
    try {
      const rate = await getCurrentRate(
        createAirwallexClient(env, { logger: createLogger({ level: 'silent' }) }),
        { buyCurrency: pair.base, sellCurrency: pair.quote, buyAmount: '1000' },
      );
      return { price: rate.price, source: 'AIRWALLEX' };
    } catch {
      // The sandbox rate is optional. The anchor below still lets a sample be created.
    }
  }
  const anchor = DEMO_ANCHORS.find((item) => item.base === pair.base && item.quote === pair.quote);
  return { price: anchor?.price ?? '1', source: 'SIMULATED' };
}
