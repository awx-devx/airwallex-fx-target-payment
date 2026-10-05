import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/route';
import { healthReportSchema } from '@/contracts/health';
import { instant, type Clock } from '@/server/adapters/clock';
import { toDecimal128 } from '@/server/db/decimal';
import { Bill } from '@/server/db/models';
import { parseEnv, resetEnvCache } from '@/server/env';
import { createQueue, createWorker } from '@/server/queue';
import { HEARTBEAT_KEY } from '@/server/heartbeat';
import { collectHealth } from '@/server/services/health';
import {
  bootDb,
  isolatedPrefix,
  shutdownDb,
  watchingBillInput,
} from '@/server/test/harness';

const NOW = Date.parse('2026-06-01T16:00:00.000Z');
const clock: Clock = { now: () => instant(NOW) };

describe('health', () => {
  beforeAll(async () => {
    await bootDb();
  });

  afterAll(async () => {
    const redis = new Redis(process.env.REDIS_URL ?? '');
    await redis.del(HEARTBEAT_KEY);
    redis.disconnect();
    await shutdownDb();
  });

  it('reports a fresh worker, a fresh feed, and a failed job', async () => {
    const env = parseEnv(process.env);
    const prefix = isolatedPrefix('health');
    const beat = `${prefix}:heartbeat`;
    const redis = new Redis(env.REDIS_URL);
    await redis.set(beat, instant(NOW).toISOString());
    redis.disconnect();
    await Bill.create({
      ...watchingBillInput('fresh'),
      last: {
        price: toDecimal128('1.08'),
        at: instant(NOW - 1_000),
        source: 'SIMULATED',
      },
    });
    await Bill.create({
      ...watchingBillInput('stale'),
      billCurrency: 'GBP',
      last: {
        price: toDecimal128('1.27'),
        at: instant(NOW - 30_000),
        source: 'SIMULATED',
      },
    });
    const queue = createQueue('execution', { url: env.REDIS_URL, prefix });
    const worker = createWorker(
      'execution',
      async () => {
        throw new Error('stopped');
      },
      { url: env.REDIS_URL, prefix },
    );
    try {
      await queue.add(
        'execution',
        { billId: 'b', attempt: 1, mode: 'TARGET' },
        { jobId: 'health-fail', attempts: 1 },
      );
      await vi.waitFor(
        async () => {
          expect((await queue.getJobCounts('failed')).failed).toBe(1);
        },
        { timeout: 4_000 },
      );
      const report = await collectHealth({
        env,
        clock,
        prefix,
        heartbeatKey: beat,
      });
      expect(healthReportSchema.safeParse(report).success).toBe(true);
      expect(report.ok).toBe(true);
      expect(report.checks).toMatchObject({
        mongo: 'ok',
        redis: 'ok',
        worker: 'ok',
        airwallex: 'ok',
      });
      expect(report.feeds.find((feed) => feed.pair === 'EUR/USD')?.fresh).toBe(
        true,
      );
      expect(report.feeds.find((feed) => feed.pair === 'GBP/USD')?.fresh).toBe(
        false,
      );
      expect(
        report.queues.find((queueRow) => queueRow.name === 'execution')?.failed,
      ).toBe(1);
    } finally {
      await worker.close();
      await queue.close();
    }
  });

  it('treats a missing Airwallex key as down and a mock gateway as ok', async () => {
    const env = parseEnv(process.env);
    const beat = isolatedPrefix('beat');
    const redis = new Redis(env.REDIS_URL);
    await redis.set(beat, instant(NOW).toISOString());
    redis.disconnect();
    const mock = await collectHealth({
      env,
      clock,
      heartbeatKey: beat,
      prefix: isolatedPrefix('health-mock'),
    });
    expect(mock.checks.airwallex).toBe('ok');
    const live = await collectHealth({
      env: {
        ...env,
        PAYMENTS_GATEWAY: 'airwallex',
        AIRWALLEX_CLIENT_ID: undefined,
        AIRWALLEX_API_KEY: undefined,
      },
      clock,
      heartbeatKey: beat,
      prefix: isolatedPrefix('health-live'),
    });
    expect(live.checks.airwallex).toBe('down');
    expect(live.ok).toBe(false);
  });

  it('returns 503 when the worker heartbeat is missing', async () => {
    const redis = new Redis(process.env.REDIS_URL ?? '');
    await redis.set(HEARTBEAT_KEY, new Date().toISOString());
    const up = await GET();
    expect(up.status).toBe(200);
    expect(healthReportSchema.safeParse(await up.json()).success).toBe(true);
    await redis.del(HEARTBEAT_KEY);
    redis.disconnect();
    resetEnvCache();
    const down = await GET();
    expect(down.status).toBe(503);
    const body = healthReportSchema.parse(await down.json());
    expect(body.checks.worker).toBe('down');
    expect(body.ok).toBe(false);
  });

  it('reports a closed database and redis as down without waiting', async () => {
    const env = {
      ...parseEnv(process.env),
      MONGODB_URI: 'mongodb://127.0.0.1:1/none',
      REDIS_URL: 'redis://127.0.0.1:1',
    };
    const started = Date.now();
    const report = await collectHealth({
      env,
      clock,
      prefix: isolatedPrefix('closed'),
    });
    expect(Date.now() - started).toBeLessThan(4_000);
    expect(report.ok).toBe(false);
    expect(report.checks.mongo).toBe('down');
    expect(report.checks.redis).toBe('down');
    expect(report.checks.worker).toBe('down');
    expect(report.queues).toEqual([]);
  });
});
