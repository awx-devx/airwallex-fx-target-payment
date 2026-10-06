import mongoose from 'mongoose';
import {
  clearDemoKeys,
  closeDemoStore,
  pushMarket,
} from '@/server/adapters/demo/store';
import { connectMongo, disconnectMongo } from '@/server/db/connection';
import { EnvError, parseEnv } from '@/server/env';
import { QUEUE_NAMES, createQueue } from '@/server/queue';

async function main(): Promise<number> {
  try {
    const env = parseEnv(process.env);
    if (!env.DEMO_MODE) {
      process.stderr.write('db:reset requires DEMO_MODE=true.\n');
      return 1;
    }
    await connectMongo(env.MONGODB_URI);
    const db = mongoose.connection.db;
    if (!db) {
      process.stderr.write('Mongo connection has no database.\n');
      return 1;
    }
    const collections = (await db.listCollections().toArray()).filter(
      (collection) => !collection.name.startsWith('system.'),
    );
    for (const collection of collections) {
      await db.dropCollection(collection.name);
      process.stdout.write(`Dropped ${collection.name}\n`);
    }
    for (const name of QUEUE_NAMES) {
      const queue = createQueue(name, { url: env.REDIS_URL });
      await queue.obliterate({ force: true });
      await queue.close();
      process.stdout.write(`Emptied queue ${name}\n`);
    }
    await clearDemoKeys(env.REDIS_URL);
    await pushMarket(env.REDIS_URL, { op: 'reset' });
    process.stdout.write(
      `Dropped ${collections.length} collections and reset queues, clock, and market. Run pnpm db:indexes to recreate collections.\n`,
    );
    return 0;
  } catch (error) {
    if (error instanceof EnvError) process.stderr.write(`${error.message}\n`);
    else
      process.stderr.write(
        `${error instanceof Error ? error.message : 'db:reset failed'}\n`,
      );
    return 1;
  } finally {
    await closeDemoStore();
    await disconnectMongo();
  }
}

main().then(
  (code) => process.exit(code),
  () => process.exit(1),
);
