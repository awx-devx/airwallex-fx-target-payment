import { createAirwallexClient } from '@/server/adapters/airwallex/client';
import { getCurrentBalances } from '@/server/adapters/airwallex/endpoints/balances';
import { shortWallet } from '@/server/adapters/demo/store';
import type { Env } from '@/server/env';

export interface CurrentBalance {
  currency: string;
  available: string;
  pending: string;
  reserved: string;
  total: string;
}

export function currentBalances(env: Env): {
  getBalances(): Promise<CurrentBalance[]>;
} {
  if (env.PAYMENTS_GATEWAY === 'mock') {
    return {
      async getBalances() {
        // DEMO-ONLY: the mock gateway reports a funded wallet so triggers are not blocked.
        // The insufficient-balance scenario clears that balance.
        // PROD: GET /balances/current.
        const available = (await shortWallet(env.REDIS_URL))
          ? '0'
          : '1000000000';
        return ['USD', 'EUR', 'GBP', 'AUD', 'SGD'].map((currency) => ({
          currency,
          available,
          pending: '0',
          reserved: '0',
          total: available,
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
