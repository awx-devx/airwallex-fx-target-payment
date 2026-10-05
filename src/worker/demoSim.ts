import { readRealMs, type Clock } from '@/server/adapters/clock';
import { listSims, refreshDemoClock } from '@/server/adapters/demo/store';
import type { RateSource } from '@/server/adapters/rates';
import type { Env } from '@/server/env';
import type { AppLogger } from '@/server/logging/logger';
import { eventPublisher } from '@/server/services/bills';
import { applyPendingMarket } from '@/server/services/demo';
import { stepDemoSims } from '@/server/services/demoSim';
import { runLoop } from '@/worker/loop';

/**
 * DEMO-ONLY: pacing uses wall-clock seconds even under the warp clock.
 * PROD: this loop is not started. Triggers come from the live poller.
 */
export function startDemoSim(options: {
  signal: AbortSignal;
  env: Env;
  clock: Clock;
  source: RateSource;
  logger: AppLogger;
  readRealMs?: () => number;
}): void {
  const read = options.readRealMs ?? readRealMs;
  runLoop(
    options.signal,
    1_000,
    async () => {
      await refreshDemoClock(options.env.REDIS_URL);
      await applyPendingMarket(options.env);
      const running = await listSims(options.env.REDIS_URL);
      if (running.length === 0) return;
      await stepDemoSims({
        env: options.env,
        clock: options.clock,
        nowRealMs: read(),
        source: options.source,
        publisher: eventPublisher(options.env.REDIS_URL),
      });
    },
    (error) => {
      options.logger.error({ err: error }, 'demo sim failed');
    },
  );
}
