import mongoose from 'mongoose';
import { decimal128JsonPlugin } from '@/server/db/decimal';
import { ServiceError } from '@/server/services/errors';

type Cache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  uri: string | null;
};

const globalForDb = globalThis as typeof globalThis & { __fxMongo?: Cache };

let pluginsApplied = false;

export function applyDbPlugins(): void {
  if (pluginsApplied) return;
  pluginsApplied = true;
  mongoose.plugin(decimal128JsonPlugin);
  mongoose.plugin(connectBeforeQuery);
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  mongoose.set('bufferTimeoutMS', 2_000);
}

/** The Next server never opened the default connection. Queries do it themselves. */
function connectBeforeQuery(schema: mongoose.Schema): void {
  const ensure = async function ensureConnection(this: unknown): Promise<void> {
    if (mongoose.connection.readyState === 1) return;
    const { getEnv } = await import('@/server/env');
    try {
      await connectMongo(getEnv().MONGODB_URI);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('AIRWALLEX_UNAVAILABLE', 'The database is unavailable', 503);
    }
  };
  schema.pre(/^find/, ensure);
  schema.pre(/^count/, ensure);
  schema.pre(/^update/, ensure);
  schema.pre(/^delete/, ensure);
  schema.pre(/^replace/, ensure);
  schema.pre('save', ensure);
  schema.pre('aggregate', ensure);
}

function cache(): Cache {
  globalForDb.__fxMongo ??= { conn: null, promise: null, uri: null };
  return globalForDb.__fxMongo;
}

/** One connection per process, kept on `globalThis` so Next.js hot reload reuses it. */
export async function connectMongo(uri: string): Promise<typeof mongoose> {
  applyDbPlugins();
  const slot = cache();
  if (slot.conn && slot.uri === uri && mongoose.connection.readyState === 1) {
    return slot.conn;
  }
  if (slot.promise && slot.uri === uri) return slot.promise;

  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  slot.conn = null;
  slot.uri = uri;
  slot.promise = mongoose.connect(uri, { serverSelectionTimeoutMS: 1_500 }).then((connected) => {
    slot.conn = connected;
    return connected;
  });
  try {
    return await slot.promise;
  } catch (error) {
    slot.promise = null;
    slot.uri = null;
    throw error;
  }
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  const slot = cache();
  slot.conn = null;
  slot.promise = null;
  slot.uri = null;
}
