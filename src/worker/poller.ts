import type { Clock } from '@/server/adapters/clock';
import { simBillIds } from '@/server/adapters/demo/store';
import type { RateSource } from '@/server/adapters/rates';
import type { Env } from '@/server/env';
import type { AppLogger } from '@/server/logging/logger';
import { eventPublisher } from '@/server/services/bills';
import { pollWatchingBills } from '@/server/services/pollRates';
import { runLoop } from '@/worker/loop';

/**
 * Polls watching and paused bills on a fixed interval. The loop stays out of
 * BullMQ so a warp clock can speed it up without delayed jobs.
 */
export function startPoller(options: {
  signal: AbortSignal;
  intervalMs: number;
  logger: AppLogger;
  env: Env;
  clock: Clock;
  source: RateSource;
  onPoll?: () => Promise<void>;
}): void {
  runLoop(
    options.signal,
    options.intervalMs,
    async () => {
      if (options.onPoll) {
        await options.onPoll();
        return;
      }
      const skipBillIds = await simBillIds(options.env.REDIS_URL).catch(
        (error: unknown) => {
          options.logger.warn({ err: error }, 'demo sim lookup failed');
          return new Set<string>();
        },
      );
      await pollWatchingBills({
        env: options.env,
        clock: options.clock,
        source: options.source,
        publish: (event) =>
          eventPublisher(options.env.REDIS_URL).publish(event),
        skipBillIds,
      });
    },
    (error) => {
      options.logger.error({ err: error }, 'poller failed');
    },
  );
}
