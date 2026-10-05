import { Redis } from 'ioredis';
import mongoose from 'mongoose';
import {
  healthReportSchema,
  type HealthCheck,
  type HealthFeed,
  type HealthQueue,
  type HealthReport,
} from '@/contracts/health';
import { createAirwallexClient } from '@/server/adapters/airwallex/client';
import type { Clock } from '@/server/adapters/clock';
import { Bill } from '@/server/db/models';
import type { Env } from '@/server/env';
import { HEARTBEAT_KEY, HEARTBEAT_TTL_MS } from '@/server/heartbeat';
import { QUEUE_NAMES, createQueue } from '@/server/queue';

interface WatchingFeed {
  billCurrency: string;
  homeCurrency: string;
  last?: { at?: Date } | null;
}

export async function collectHealth(input: {
  env: Env;
  clock: Clock;
  prefix?: string;
  heartbeatKey?: string;
  airwallex?: () => Promise<HealthCheck>;
}): Promise<HealthReport> {
  const [mongo, redis] = await Promise.all([
    pingMongo(input.env.MONGODB_URI),
    pingRedis(input.env.REDIS_URL),
  ]);
  const [worker, airwallex, feeds, queues] = await Promise.all([
    redis.check === 'ok'
      ? readHeartbeat(input)
      : Promise.resolve({ check: 'down' as const, ageMs: null }),
    airwallexStatus(input),
    mongo === 'ok' ? readFeeds(input) : Promise.resolve([]),
    redis.check === 'ok'
      ? readQueues(input.env.REDIS_URL, input.prefix)
      : Promise.resolve([]),
  ]);
  const checks = {
    mongo,
    redis: redis.check,
    worker: worker.check,
    airwallex,
  };
  return healthReportSchema.parse({
    ok: Object.values(checks).every((check) => check === 'ok'),
    checks,
    workerAgeMs: worker.ageMs,
    feeds,
    queues,
  });
}

async function pingMongo(uri: string): Promise<HealthCheck> {
  const conn = mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 1_500,
    connectTimeoutMS: 1_500,
    socketTimeoutMS: 1_500,
  });
  try {
    await conn.asPromise();
    if (!conn.db) return 'down';
    await conn.db.command({ ping: 1 });
    return 'ok';
  } catch {
    return 'down';
  } finally {
    await conn.close().catch(() => undefined);
  }
}

function openRedis(url: string, maxRetriesPerRequest: number | null): Redis {
  const redis = new Redis(url, {
    maxRetriesPerRequest,
    connectTimeout: 1_000,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => undefined);
  return redis;
}

async function pingRedis(url: string): Promise<{ check: HealthCheck }> {
  const redis = openRedis(url, 1);
  try {
    await redis.connect();
    const pong = await redis.ping();
    return { check: pong === 'PONG' ? 'ok' : 'down' };
  } catch {
    return { check: 'down' };
  } finally {
    redis.disconnect();
  }
}

async function readHeartbeat(input: {
  env: Env;
  clock: Clock;
  heartbeatKey?: string;
}): Promise<{ check: HealthCheck; ageMs: number | null }> {
  const redis = openRedis(input.env.REDIS_URL, 1);
  try {
    await redis.connect();
    const raw = await redis.get(input.heartbeatKey ?? HEARTBEAT_KEY);
    if (!raw) return { check: 'down', ageMs: null };
    const at = Date.parse(raw);
    if (Number.isNaN(at)) return { check: 'down', ageMs: null };
    const ageMs = input.clock.now().getTime() - at;
    const check = ageMs >= 0 && ageMs < HEARTBEAT_TTL_MS ? 'ok' : 'down';
    return { check, ageMs };
  } catch {
    return { check: 'down', ageMs: null };
  } finally {
    redis.disconnect();
  }
}

async function airwallexStatus(input: {
  env: Env;
  clock: Clock;
  airwallex?: () => Promise<HealthCheck>;
}): Promise<HealthCheck> {
  if (input.airwallex) return input.airwallex();
  if (input.env.PAYMENTS_GATEWAY === 'mock') return 'ok';
  if (!input.env.AIRWALLEX_CLIENT_ID || !input.env.AIRWALLEX_API_KEY)
    return 'down';
  try {
    const client = createAirwallexClient(input.env, { clock: input.clock });
    await client.confirmToken();
    return 'ok';
  } catch {
    return 'down';
  }
}

async function readFeeds(input: {
  env: Env;
  clock: Clock;
}): Promise<HealthFeed[]> {
  const bills = (await Bill.find({ state: { $in: ['WATCHING', 'PAUSED'] } })
    .select('billCurrency homeCurrency last')
    .lean()) as WatchingFeed[];
  const latest = new Map<string, number | null>();
  for (const bill of bills) {
    const pair = `${bill.billCurrency}/${bill.homeCurrency}`;
    const at = bill.last?.at instanceof Date ? bill.last.at.getTime() : null;
    const previous = latest.get(pair);
    if (
      previous === undefined ||
      (at !== null && (previous === null || at > previous))
    ) {
      latest.set(pair, at);
    }
  }
  const now = input.clock.now().getTime();
  const limit = input.env.POLL_INTERVAL_MS * 2;
  return [...latest].map(([pair, at]) => {
    const ageMs = at === null ? null : now - at;
    const fresh = ageMs !== null && ageMs >= 0 && ageMs < limit;
    return { pair, ageMs, fresh };
  });
}

async function readQueues(
  url: string,
  prefix?: string,
): Promise<HealthQueue[]> {
  const queues = QUEUE_NAMES.map((name) =>
    createQueue(name, { url, ...(prefix ? { prefix } : {}) }),
  );
  try {
    return await Promise.all(
      queues.map(async (queue) => {
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'failed',
          'delayed',
        );
        return {
          name: queue.name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        };
      }),
    );
  } finally {
    await Promise.all(queues.map((queue) => queue.close()));
  }
}
