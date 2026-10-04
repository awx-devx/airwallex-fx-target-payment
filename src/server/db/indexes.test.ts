import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { toDecimal128 } from '@/server/db/decimal';
import { Bill, Execution, RateTick } from '@/server/db/models';
import { bootDb, shutdownDb, watchingBillInput } from '@/server/test/harness';

beforeAll(async () => {
  await bootDb();
});

afterAll(async () => {
  await shutdownDb();
});

describe('indexes', () => {
  it('syncs a partial unique execution index and a time-series rate collection', async () => {
    const indexes = await Execution.collection.indexes();
    const partial = indexes.find((index) => index.partialFilterExpression);
    expect(partial).toMatchObject({
      unique: true,
      key: { billId: 1 },
      partialFilterExpression: { active: true },
    });

    const collections = await mongoose.connection.db!.listCollections({ name: 'rate_ticks' }).toArray();
    const rateTicks = collections[0] as
      | { type?: string; options?: { expireAfterSeconds?: number } }
      | undefined;
    expect(rateTicks?.type).toBe('timeseries');
    expect(rateTicks?.options?.expireAfterSeconds).toBe(30 * 24 * 60 * 60);

    const bill = await Bill.create(watchingBillInput('idx'));
    await Execution.create({
      billId: bill._id,
      mode: 'TARGET',
      attempt: 1,
      requestId: `tr:${bill._id}:1`,
      active: true,
    });
    await expect(
      Execution.create({
        billId: bill._id,
        mode: 'MANUAL',
        attempt: 2,
        requestId: `tr:${bill._id}:2`,
        active: true,
      }),
    ).rejects.toMatchObject({ code: 11000 });
    await Execution.create({
      billId: bill._id,
      mode: 'DEADLINE',
      attempt: 3,
      requestId: `tr:${bill._id}:3`,
      active: false,
    });

    const other = await Bill.create(watchingBillInput('idx-other'));
    await Execution.create({
      billId: other._id,
      mode: 'TARGET',
      attempt: 1,
      requestId: `tr:${other._id}:1`,
      active: true,
    });

    await RateTick.create({
      ts: new Date('2026-10-04T00:00:00.000Z'),
      meta: { base: 'EUR', quote: 'USD', source: 'SIMULATED' },
      price: toDecimal128('1.08'),
    });
  });

  it('keeps seedKey unique only when it is set', async () => {
    await Bill.create({ ...watchingBillInput('seed-a'), seedKey: 'demo:1' });
    await expect(
      Bill.create({ ...watchingBillInput('seed-b'), seedKey: 'demo:1' }),
    ).rejects.toMatchObject({ code: 11000 });
    await Bill.create(watchingBillInput('seed-c'));
    await Bill.create(watchingBillInput('seed-d'));
  });
});
