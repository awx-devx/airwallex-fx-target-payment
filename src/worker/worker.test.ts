import { spawn } from 'node:child_process';
import path from 'node:path';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClock } from '@/server/adapters/clock';
import { Bill } from '@/server/db/models';
import { parseEnv } from '@/server/env';
import { captureLogs } from '@/server/logging/logger';
import { createQueue, createWorker, jobIds } from '@/server/queue';
import {
  bootDb,
  isolatedPrefix,
  shutdownDb,
  watchingBillInput,
} from '@/server/test/harness';
import { startWorker } from '@/worker/runtime';

beforeAll(async () => {
  await bootDb();
});

afterAll(async () => {
  await shutdownDb();
});

describe('worker', () => {
  it('starts and stops, and a second worker does not take the lock', async () => {
    const env = parseEnv(process.env);
    const logger = captureLogs('silent').logger;
    const nowMs = 1_700_000_000_000;
    const clock = createClock('system', () => nowMs);
    const lockKey = isolatedPrefix('leader');
    const heartbeatKey = isolatedPrefix('heartbeat');
    let firstPolls = 0;
    let secondPolls = 0;
    const timing = {
      env,
      clock,
      logger,
      lockKey,
      heartbeatKey,
      queuePrefix: isolatedPrefix('queues'),
      renewMs: 40,
      lockTtlMs: 5_000,
      heartbeatMs: 30,
      sweeperMs: 1_000,
      pollIntervalMs: 20,
      scheduleReconcile: false,
      closeMongo: false,
    };
    const first = await startWorker({
      ...timing,
      id: 'worker-a',
      onPoll: async () => {
        firstPolls += 1;
      },
    });
    await vi.waitFor(() => expect(firstPolls).toBeGreaterThan(0));
    const redis = new Redis(env.REDIS_URL);
    await vi.waitFor(async () => {
      expect(await redis.get(heartbeatKey)).toBe(new Date(nowMs).toISOString());
    });

    const second = await startWorker({
      ...timing,
      id: 'worker-b',
      onPoll: async () => {
        secondPolls += 1;
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(secondPolls).toBe(0);
    expect(firstPolls).toBeGreaterThan(0);

    await first.stop();
    const stoppedAt = firstPolls;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(firstPolls).toBe(stoppedAt);
    await second.stop();
    await redis.quit();
  });

  it('enqueues a late deadline and logs CATCH_UP', async () => {
    const env = parseEnv(process.env);
    const logs = captureLogs('warn');
    const dueAt = new Date('2026-10-04T12:00:00.000Z');
    const bill = await Bill.create({
      ...watchingBillInput('due'),
      timers: { autosettleAt: dueAt },
    });
    const prefix = isolatedPrefix('sweep');
    const worker = await startWorker({
      env,
      clock: createClock('system', () => dueAt.getTime() + 120_000),
      logger: logs.logger,
      queuePrefix: prefix,
      lockKey: isolatedPrefix('sweep-lock'),
      heartbeatKey: isolatedPrefix('sweep-beat'),
      sweeperMs: 50,
      pollIntervalMs: 1_000,
      scheduleReconcile: false,
      closeMongo: false,
    });
    const queue = createQueue('deadline', { url: env.REDIS_URL, prefix });
    await vi.waitFor(async () => {
      const job = await queue.getJob(
        jobIds.deadlineAutosettle(String(bill._id)),
      );
      expect(job).not.toBeNull();
    });
    expect(logs.lines().some((line) => line.msg === 'CATCH_UP')).toBe(true);
    await worker.stop();
    await queue.close();
  });

  it('keeps a waiting job when the worker restarts', async () => {
    const url = process.env.REDIS_URL ?? '';
    const prefix = isolatedPrefix('restart');
    const queue = createQueue('notify', { url, prefix });
    const worker = createWorker('notify', async () => undefined, {
      url,
      prefix,
    });
    await worker.waitUntilReady();
    await worker.pause();
    const jobId = jobIds.notify('stay');
    await queue.add('notify', { notificationId: 'stay' }, { jobId });
    await worker.close();

    const afterClose = await queue.getJob(jobId);
    expect(afterClose).not.toBeNull();
    expect(await afterClose?.getState()).toBe('waiting');

    let ran = false;
    const restarted = createWorker(
      'notify',
      async () => {
        ran = true;
      },
      { url, prefix },
    );
    await vi.waitFor(() => expect(ran).toBe(true));
    await restarted.close();
    await queue.close();
  });
});

describe('worker boot', () => {
  it('exits when a required variable is missing', async () => {
    const env = { ...process.env };
    delete env.MONGODB_URI;
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'src/worker/index.ts'],
      {
        cwd: path.resolve(import.meta.dirname, '../..'),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });
    const code = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`worker did not exit\n${stderr}`));
      }, 20_000);
      child.on('exit', (exitCode) => {
        clearTimeout(timer);
        resolve(exitCode);
      });
    });
    expect(code).toBe(1);
    expect(stderr).toContain('MONGODB_URI');
  });
});
