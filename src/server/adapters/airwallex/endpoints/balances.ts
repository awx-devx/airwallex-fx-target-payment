import type { BalanceSummary } from '@/contracts/airwallex';
import type { AirwallexClient } from '@/server/adapters/airwallex/client';
import {
  mapBalanceHistory,
  mapBalances,
  type BalanceHistoryPage,
} from '@/server/adapters/airwallex/mappers';

export async function getCurrentBalances(
  client: AirwallexClient,
): Promise<BalanceSummary[]> {
  const payload = await client.request({
    method: 'GET',
    path: '/balances/current',
  });
  return mapBalances(payload, client.clock.now().toISOString());
}

export async function getBalanceHistory(
  client: AirwallexClient,
  query?: { pageAfter?: string; currency?: string },
): Promise<BalanceHistoryPage> {
  const payload = await client.request({
    method: 'GET',
    path: '/balances/history',
    query: { page_after: query?.pageAfter, currency: query?.currency },
  });
  return mapBalanceHistory(payload);
}
