import type { AirwallexClient } from '@/server/adapters/airwallex/client';
import {
  mapCurrentRate,
  type MappedRate,
} from '@/server/adapters/airwallex/mappers';

export async function getCurrentRate(
  client: AirwallexClient,
  input: {
    buyCurrency: string;
    sellCurrency: string;
    buyAmount: string;
    conversionDate?: string;
  },
): Promise<MappedRate> {
  const payload = await client.request({
    method: 'GET',
    path: '/fx/rates/current',
    query: {
      buy_currency: input.buyCurrency,
      sell_currency: input.sellCurrency,
      buy_amount: input.buyAmount,
      conversion_date: input.conversionDate,
    },
  });
  return mapCurrentRate(payload, input.buyCurrency);
}
