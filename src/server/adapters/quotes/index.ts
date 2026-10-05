import { quoteSummarySchema, type QuoteSummary, type QuoteValidity } from '@/contracts/airwallex';
import { D } from '@/contracts/money';
import type { Clock } from '@/server/adapters/clock';
import { createAirwallexClient } from '@/server/adapters/airwallex/client';
import { createQuote } from '@/server/adapters/airwallex/endpoints/quotes';
import type { Env } from '@/server/env';

export interface QuoteLock {
  lock(input: {
    buy: string;
    sell: string;
    buyAmount: string;
    validity: QuoteValidity;
  }): Promise<QuoteSummary>;
}

export function quoteLock(env: Env, clock: Clock): QuoteLock {
  if (env.PAYMENTS_GATEWAY === 'mock') return mockQuoteLock(clock);
  return {
    async lock(input) {
      const client = createAirwallexClient(env);
      return createQuote(client, {
        buyCurrency: input.buy,
        sellCurrency: input.sell,
        buyAmount: input.buyAmount,
        validity: input.validity,
      });
    },
  };
}

function mockQuoteLock(clock: Clock): QuoteLock {
  let sequence = 0;
  return {
    async lock(input) {
      // DEMO-ONLY: mock gateway quotes are local and are not Airwallex quote ids.
      // PROD: PAYMENTS_GATEWAY=airwallex, which calls POST /fx/quotes/create.
      sequence += 1;
      const now = clock.now();
      const price = '1';
      return quoteSummarySchema.parse({
        airwallexQuoteId: `mock-${now.getTime()}-${sequence}`,
        price,
        sellAmount: D(input.buyAmount).mul(price).toFixed(),
        buyAmount: input.buyAmount,
        clientRate: price,
        clientRateOriented: price,
        validity: input.validity,
        validFromAt: now.toISOString(),
        validToAt: new Date(now.getTime() + 60_000).toISOString(),
        usage: 'SINGLE_USE',
        conversionDate: now.toISOString().slice(0, 10),
      });
    },
  };
}
