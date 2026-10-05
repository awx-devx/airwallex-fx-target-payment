import type { Clock } from '@/server/adapters/clock';
import { closeExtractionBudget } from '@/server/adapters/extraction/budget';
import { createRateSource } from '@/server/adapters/rates';
import { connectMongo, disconnectMongo } from '@/server/db/connection';
import type { Env } from '@/server/env';
import type { AppLogger } from '@/server/logging/logger';
import {
  QUEUE_NAMES,
  createQueue,
  createWorker,
  type QueueName,
} from '@/server/queue';
import { Redis } from 'ioredis';
import {
  HEARTBEAT_KEY,
  HEARTBEAT_MS,
  HEARTBEAT_TTL_MS,
  LEADER_KEY,
  LEADER_RENEW_MS,
  LEADER_TTL_MS,
  LeaderLock,
  startLeaderLoop,
} from '@/worker/leader';
import { startPoller } from '@/worker/poller';
import { defaultProcessors, type ProcessorMap } from '@/worker/processors';
import { closeWorkQueues } from '@/server/queue/work';
import { closeEventPublisher } from '@/server/services/bills';
import { startSweeper } from '@/worker/sweeper';
import type { Processor, Queue, Worker } from 'bullmq';

const SWEEPER_MS = 1_000;

export type WorkerHandle = {
  stop: () => Promise<void>;
};

export async function startWorker(options: {
  env: Env;
  clock: Clock;
  logger: AppLogger;
  id?: string;
  lockKey?: string;
  heartbeatKey?: string;
  queuePrefix?: string;
  renewMs?: number;
  lockTtlMs?: number;
  heartbeatMs?: number;
  sweeperMs?: number;
  pollIntervalMs?: number;
  scheduleReconcile?: boolean;
  closeMongo?: boolean;
  processors?: Partial<Record<QueueName, Processor>>;
  onPoll?: () => Promise<void>;
}): Promise<WorkerHandle> {
  const env = options.env;
  const logger = options.logger;
  await connectMongo(env.MONGODB_URI);
  const rateSource = await createRateSource(env);

  const prefix = options.queuePrefix ?? 'bull';
  const lockRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const processors: ProcessorMap = {
    ...defaultProcessors,
    ...options.processors,
  };

  const queues = new Map<QueueName, Queue>();
  const workers: Worker[] = [];
  for (const name of QUEUE_NAMES) {
    const queue = createQueue(name, { url: env.REDIS_URL, prefix });
    queues.set(name, queue);
    const worker = createWorker(name, processors[name], {
      url: env.REDIS_URL,
      prefix,
    });
    worker.on('error', (error) => {
      logger.error({ err: error, queue: name }, 'queue worker error');
    });
    workers.push(worker);
  }

  if (options.scheduleReconcile !== false) {
    const reconcile = queues.get('reconcile');
    if (!reconcile) throw new Error('reconcile queue is missing');
    await reconcile.upsertJobScheduler(
      'reconcile',
      { every: 60_000 },
      {
        name: 'reconcile',
        data: {},
      },
    );
    const candles = queues.get('candles');
    if (!candles) throw new Error('candles queue is missing');
    await candles.upsertJobScheduler('candles', { every: 60_000 }, { name: 'candles', data: {} });
  }

  const deadlineQueue = queues.get('deadline');
  if (!deadlineQueue) throw new Error('deadline queue is missing');

  let sweeperAbort: AbortController | undefined;
  let pollerAbort: AbortController | undefined;
  let heartbeat: NodeJS.Timeout | undefined;

  const stopLoops = () => {
    sweeperAbort?.abort();
    pollerAbort?.abort();
    sweeperAbort = undefined;
    pollerAbort = undefined;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
  };

  const writeHeartbeat = async () => {
    await lockRedis.set(
      options.heartbeatKey ?? HEARTBEAT_KEY,
      options.clock.now().toISOString(),
      'PX',
      HEARTBEAT_TTL_MS,
    );
  };

  const startLoops = () => {
    stopLoops();
    sweeperAbort = new AbortController();
    pollerAbort = new AbortController();
    startSweeper({
      signal: sweeperAbort.signal,
      intervalMs: options.sweeperMs ?? SWEEPER_MS,
      clock: options.clock,
      deadlineQueue,
      logger,
    });
    startPoller({
      signal: pollerAbort.signal,
      intervalMs: options.pollIntervalMs ?? env.POLL_INTERVAL_MS,
      logger,
      env,
      clock: options.clock,
      source: rateSource,
      onPoll: options.onPoll,
    });
    void writeHeartbeat();
    heartbeat = setInterval(() => {
      void writeHeartbeat();
    }, options.heartbeatMs ?? HEARTBEAT_MS);
  };

  const leader = startLeaderLoop({
    lock: new LeaderLock(
      lockRedis,
      options.id ?? crypto.randomUUID(),
      options.lockKey ?? LEADER_KEY,
      options.lockTtlMs ?? LEADER_TTL_MS,
    ),
    renewMs: options.renewMs ?? LEADER_RENEW_MS,
    onAcquired: startLoops,
    onLost: stopLoops,
  });

  let stopped = false;
  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      await leader.stop();
      stopLoops();
      await Promise.all(workers.map((worker) => worker.close()));
      await Promise.all([...queues.values()].map((queue) => queue.close()));
      await lockRedis.quit();
      await closeEventPublisher();
      await closeExtractionBudget();
      await closeWorkQueues();
      if (options.closeMongo !== false) await disconnectMongo();
    },
  };
}
