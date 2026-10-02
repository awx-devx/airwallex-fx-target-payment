import type { ChartRange } from '@/contracts/chart';

export const qk = {
  bills: ['bills'] as const,
  bill: (id: string) => ['bill', id] as const,
  chart: (id: string, range: ChartRange) => ['chart', id, range] as const,
  events: (id: string) => ['events', id] as const,
  balances: ['balances'] as const,
};
