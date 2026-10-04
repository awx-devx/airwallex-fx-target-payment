import { balanceSummarySchema, type BalanceSummary } from '@/contracts/airwallex';
import type { Clock } from '@/server/adapters/clock';

export interface BalanceSource {
  getBalances(): Promise<
    Array<{
      currency: string;
      available: string;
      pending: string;
      reserved: string;
      total: string;
    }>
  >;
}

const TTL_MS = 30_000;

export async function readBalances(input: {
  source: BalanceSource;
  clock: Clock;
  cache: { at: number; rows: BalanceSummary[] } | null;
}): Promise<{ rows: BalanceSummary[]; cache: { at: number; rows: BalanceSummary[] } }> {
  const now = input.clock.now().getTime();
  if (input.cache && now - input.cache.at < TTL_MS) {
    return { rows: input.cache.rows, cache: input.cache };
  }
  const asOf = input.clock.now().toISOString();
  const rows = (await input.source.getBalances()).map((row) =>
    balanceSummarySchema.parse({ ...row, asOf }),
  );
  return { rows, cache: { at: now, rows } };
}
