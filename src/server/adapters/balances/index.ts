import { createAirwallexClient } from '@/server/adapters/airwallex/client';
import { getCurrentBalances } from '@/server/adapters/airwallex/endpoints/balances';
import type { Env } from '@/server/env';

export interface CurrentBalance {
  currency: string;
  available: string;
  pending: string;
  reserved: string;
  total: string;
}

export function currentBalances(env: Env): { getBalances(): Promise<CurrentBalance[]> } {
  if (env.PAYMENTS_GATEWAY === 'mock') {
    return {
      async getBalances() {
        // DEMO-ONLY: the mock gateway reports a funded wallet so triggers are not blocked.
        // PROD: GET /balances/current.
        return ['USD', 'EUR', 'GBP', 'AUD', 'SGD'].map((currency) => ({
          currency,
          available: '1000000000',
          pending: '0',
          reserved: '0',
          total: '1000000000',
        }));
      },
    };
  }
  return {
    async getBalances() {
      const rows = await getCurrentBalances(createAirwallexClient(env));
      return rows.map(({ currency, available, pending, reserved, total }) => ({
        currency,
        available,
        pending,
        reserved,
        total,
      }));
    },
  };
}
