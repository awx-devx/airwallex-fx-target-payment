import type { AirwallexClient } from '@/server/adapters/airwallex/client';
import { conversionRequestId } from '@/server/adapters/airwallex/requestIds';

export interface CreateConversionInput {
  billId: string;
  attempt: number;
  buyCurrency: string;
  buyAmount: string;
  sellCurrency: string;
  quoteId: string;
}

export async function createConversion(
  client: AirwallexClient,
  input: CreateConversionInput,
): Promise<unknown> {
  return client.request({
    method: 'POST',
    path: '/fx/conversions/create',
    body: {
      request_id: conversionRequestId(input.billId, input.attempt),
      buy_currency: input.buyCurrency,
      buy_amount: input.buyAmount,
      sell_currency: input.sellCurrency,
      quote_id: input.quoteId,
    },
  });
}

export async function getConversion(
  client: AirwallexClient,
  conversionId: string,
): Promise<unknown> {
  return client.request({
    method: 'GET',
    path: `/fx/conversions/${conversionId}`,
  });
}
