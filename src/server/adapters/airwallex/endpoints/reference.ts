import type { CorridorQuota, NonConversionDay } from '@/contracts/airwallex';
import type { AirwallexClient } from '@/server/adapters/airwallex/client';
import {
  mapCorridorQuota,
  mapNonConversionDays,
  mapSupportedCurrencies,
  type SupportedCurrencies,
} from '@/server/adapters/airwallex/mappers';

export async function supportedCurrencies(
  client: AirwallexClient,
): Promise<SupportedCurrencies> {
  const payload = await client.request({
    method: 'GET',
    path: '/reference/supported_currencies',
  });
  return mapSupportedCurrencies(payload);
}

export async function invalidConversionDates(
  client: AirwallexClient,
  currencyPair: string,
): Promise<NonConversionDay[]> {
  const payload = await client.request({
    method: 'GET',
    path: '/reference/invalid_conversion_dates',
    query: { currency_pair: currencyPair },
  });
  return mapNonConversionDays(payload);
}

export async function corridorQuota(
  client: AirwallexClient,
  type: CorridorQuota['type'],
): Promise<CorridorQuota> {
  const payload = await client.request({
    method: 'GET',
    path: '/reference/order_items/quota',
    query: { type },
  });
  return mapCorridorQuota(type, payload);
}
