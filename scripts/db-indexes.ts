import { connectMongo, disconnectMongo } from '@/server/db/connection';
import { syncAllIndexes } from '@/server/db/indexes';
import { EnvError, parseEnv } from '@/server/env';
import { createLogger } from '@/server/logging/logger';

async function main(): Promise<number> {
  const logger = createLogger();
  try {
    const env = parseEnv(process.env);
    await connectMongo(env.MONGODB_URI);
    await syncAllIndexes(env.RATE_TICKS_TTL_DAYS);
    logger.info({ ttlDays: env.RATE_TICKS_TTL_DAYS }, 'synced indexes');
    return 0;
  } catch (error) {
    if (error instanceof EnvError) {
      process.stderr.write(`${error.message}\n`);
    } else {
      logger.error({ err: error }, 'index sync failed');
    }
    return 1;
  } finally {
    await disconnectMongo();
  }
}

main().then(
  (code) => process.exit(code),
  () => process.exit(1),
);
