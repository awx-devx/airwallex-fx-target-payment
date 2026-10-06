import { connectMongo, disconnectMongo } from '@/server/db/connection';
import { EnvError, parseEnv } from '@/server/env';
import { clearSharedSimulatedTicks, resetGenerated } from '@/server/services/seed';

async function main(): Promise<number> {
  const generated = process.argv.includes('--generated');
  const sharedSim = process.argv.includes('--shared-sim');
  if (!generated && !sharedSim) {
    process.stderr.write(
      'Pass --generated to remove bills created by seed:generate, or --shared-sim to delete shared simulated ticks.\n',
    );
    return 1;
  }
  try {
    const env = parseEnv(process.env);
    if (!env.DEMO_MODE) {
      process.stderr.write('seed:reset requires DEMO_MODE=true.\n');
      return 1;
    }
    await connectMongo(env.MONGODB_URI);
    if (generated) {
      const removed = await resetGenerated();
      process.stdout.write(`Removed ${removed} generated bills\n`);
    }
    if (sharedSim) {
      const ticks = await clearSharedSimulatedTicks();
      process.stdout.write(`Removed ${ticks} shared simulated ticks\n`);
    }
    return 0;
  } catch (error) {
    if (error instanceof EnvError) process.stderr.write(`${error.message}\n`);
    else
      process.stderr.write(
        `${error instanceof Error ? error.message : 'seed:reset failed'}\n`,
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
