import { SystemClock } from '@/server/adapters/clock';
import { connectMongo, disconnectMongo } from '@/server/db/connection';
import { syncAllIndexes } from '@/server/db/indexes';
import { EnvError, parseEnv } from '@/server/env';
import { seedDemo } from '@/server/services/seed';

async function main(): Promise<number> {
  try {
    const env = parseEnv(process.env);
    await connectMongo(env.MONGODB_URI);
    await syncAllIndexes(env.RATE_TICKS_TTL_DAYS);
    const result = await seedDemo({ env, clock: new SystemClock() });
    process.stdout.write(
      `seed:demo created ${result.created}, skipped ${result.skipped}\n`,
    );
    return 0;
  } catch (error) {
    if (error instanceof EnvError) process.stderr.write(`${error.message}\n`);
    else
      process.stderr.write(
        `${error instanceof Error ? error.message : 'seed:demo failed'}\n`,
      );
    return 1;
  } finally {
    await disconnectMongo();
  }
}

main().then(
  (code) => process.exit(code),
  () => process.exit(1),
);
