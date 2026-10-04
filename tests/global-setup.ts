import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { RedisMemoryServer } from 'redis-memory-server';
import type { Vitest } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
    redisUrl: string;
  }
}

export default async function setup(
  vitest: Vitest,
): Promise<() => Promise<void>> {
  const mongo = await MongoMemoryReplSet.create({
    binary: { version: '7.0.14' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const redis = await RedisMemoryServer.create({
    binary: { version: '7.4.2' },
  });
  const host = await redis.getHost();
  const port = await redis.getPort();
  vitest.provide('mongoUri', mongo.getUri());
  vitest.provide('redisUrl', `redis://${host}:${port}`);
  return async () => {
    await mongo.stop();
    await redis.stop();
  };
}
