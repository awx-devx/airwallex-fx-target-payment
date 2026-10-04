import mongoose from 'mongoose';
import { toDecimal128 } from '@/server/db/decimal';
import { connectMongo, disconnectMongo } from '@/server/db/connection';
import { syncAllIndexes } from '@/server/db/indexes';
import { parseEnv, type Env } from '@/server/env';

export async function bootDb(): Promise<Env> {
  const env = parseEnv(process.env);
  await connectMongo(env.MONGODB_URI);
  await syncAllIndexes(env.RATE_TICKS_TTL_DAYS);
  return env;
}

export async function shutdownDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
  }
  await disconnectMongo();
}

export function isolatedPrefix(label: string): string {
  const pool = process.env.VITEST_POOL_ID ?? '0';
  const worker = process.env.VITEST_WORKER_ID ?? '0';
  return `${label}-${pool}-${worker}-${crypto.randomUUID()}`;
}

export function watchingBillInput(suffix: string) {
  return {
    state: 'WATCHING' as const,
    vendorName: 'Acme GmbH',
    invoiceNumber: `INV-${suffix}`,
    billCurrency: 'EUR',
    billAmount: toDecimal128('250000'),
    homeCurrency: 'USD',
    dueDate: new Date('2026-12-01T00:00:00.000Z'),
    executionDeadline: new Date('2026-11-25T00:00:00.000Z'),
    transferMethod: 'LOCAL' as const,
    leadDays: 2,
    transferReason: 'bill_payment' as const,
    reference: `INV-${suffix}`,
    displayInverted: false,
  };
}
