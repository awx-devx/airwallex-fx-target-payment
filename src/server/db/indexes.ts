import mongoose, { type Model } from 'mongoose';
import {
  Beneficiary,
  Bill,
  BillDocument,
  BillEvent,
  Execution,
  Quote,
  RateCandle,
  RateTick,
  ReferenceRate,
  Settings,
  User,
  WebhookEvent,
} from '@/server/db/models';

const MODELS: Model<unknown>[] = [
  Bill as Model<unknown>,
  BillDocument as Model<unknown>,
  Beneficiary as Model<unknown>,
  RateTick as Model<unknown>,
  RateCandle as Model<unknown>,
  ReferenceRate as Model<unknown>,
  Quote as Model<unknown>,
  Execution as Model<unknown>,
  BillEvent as Model<unknown>,
  WebhookEvent as Model<unknown>,
  User as Model<unknown>,
  Settings as Model<unknown>,
];

function isNamespaceExists(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 48
  );
}

/** Creates collections (including the `rate_ticks` time series) and runs `syncIndexes()`. */
export async function syncAllIndexes(rateTicksTtlDays: number): Promise<void> {
  for (const model of MODELS) {
    try {
      await model.createCollection();
    } catch (error) {
      if (!isNamespaceExists(error)) throw error;
    }
    await model.syncIndexes();
  }

  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB is not connected');
  await db.command({
    collMod: 'rate_ticks',
    expireAfterSeconds: rateTicksTtlDays * 24 * 60 * 60,
  });
}
