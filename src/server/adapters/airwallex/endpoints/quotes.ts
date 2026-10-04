import type { QuoteSummary, QuoteValidity } from '@/contracts/airwallex';
import type { AirwallexClient } from '@/server/adapters/airwallex/client';
import { jsonNumber } from '@/server/adapters/airwallex/json';
import { mapQuote } from '@/server/adapters/airwallex/mappers';

export async function createQuote(
  client: AirwallexClient,
  input: {
    buyCurrency: string;
    buyAmount: string;
    sellCurrency: string;
    validity: QuoteValidity;
    conversionDate?: string;
  },
): Promise<QuoteSummary> {
  const payload = await client.request({
    method: 'POST',
    path: '/fx/quotes/create',
    body: {
      buy_currency: input.buyCurrency,
      // AIRWALLEX: quote amounts are documented as JSON numbers. The decimal
      // string is written as a raw numeric literal.
      // https://www.airwallex.com/docs/api
      buy_amount: jsonNumber(input.buyAmount),
      sell_currency: input.sellCurrency,
      validity: input.validity,
      ...(input.conversionDate
        ? { conversion_date: input.conversionDate }
        : {}),
    },
  });
  return mapQuote(payload);
}

export async function getQuote(
  client: AirwallexClient,
  quoteId: string,
): Promise<QuoteSummary> {
  const payload = await client.request({
    method: 'GET',
    path: `/fx/quotes/${quoteId}`,
  });
  return mapQuote(payload);
}
