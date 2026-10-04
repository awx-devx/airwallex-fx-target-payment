import mongoose from 'mongoose';
import { decimal128JsonPlugin } from '@/server/db/decimal';

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
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
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
  slot.promise = mongoose.connect(uri).then((connected) => {
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
