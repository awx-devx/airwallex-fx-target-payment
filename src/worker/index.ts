import { createClock } from '@/server/adapters/clock';
import { EnvError, parseEnv } from '@/server/env';
import { createLogger } from '@/server/logging/logger';
import { startWorker } from '@/worker/runtime';

function readEnv() {
  try {
    return parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

async function main() {
  const env = readEnv();
  const logger = createLogger();
  const clock = createClock(env.CLOCK);
  const handle = await startWorker({
    env,
    clock,
    logger,
    demoClock: env.DEMO_MODE,
  });
  logger.info({ clock: env.CLOCK }, 'worker started');

  let stopping = false;
  async function shutdown(signal: string) {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'shutting down');
    await handle.stop();
    process.exit(0);
  }

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

void main();
