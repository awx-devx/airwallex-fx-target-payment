import type { AppLogger } from '@/server/logging/logger';
import { runLoop } from '@/worker/loop';

/**
 * The loop exists so leadership can start and stop it. B5.2 fills the body
 * with rates/current calls.
 */
export function startPoller(options: {
  signal: AbortSignal;
  intervalMs: number;
  logger: AppLogger;
  onPoll?: () => Promise<void>;
}): void {
  runLoop(
    options.signal,
    options.intervalMs,
    async () => {
      await options.onPoll?.();
    },
    (error) => {
      options.logger.error({ err: error }, 'poller failed');
    },
  );
}
