import { Redis } from 'ioredis';

const KEY = 'balances:epoch';

let redis: Redis | undefined;

function client(url: string): Redis {
  redis ??= new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  return redis;
}

export async function balanceEpoch(url: string): Promise<string> {
  const connection = client(url);
  if (connection.status === 'wait') await connection.connect();
  return (await connection.get(KEY)) ?? '0';
}

/** Balance webhooks bump this so the next balances read skips the 30s cache. */
export async function invalidateBalanceCache(url: string): Promise<void> {
  const connection = client(url);
  if (connection.status === 'wait') await connection.connect();
  await connection.incr(KEY);
}

export async function closeBalanceCache(): Promise<void> {
  const connection = redis;
  redis = undefined;
  if (connection) await connection.quit();
}
