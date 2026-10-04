import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { D } from '@/contracts/money';
import { fromDecimal128, toDecimal128 } from '@/server/db/decimal';
import { Bill } from '@/server/db/models';
import { bootDb, shutdownDb, watchingBillInput } from '@/server/test/harness';

beforeAll(async () => {
  await bootDb();
});

afterAll(async () => {
  await shutdownDb();
});

describe('Decimal128 JSON', () => {
  it('renders money fields as decimal strings', async () => {
    const bill = await Bill.create({
      ...watchingBillInput('money'),
      strategy: {
        mode: 'TARGET_RATE',
        targetPrice: toDecimal128('1.075'),
        feeEstimate: toDecimal128('0'),
        bufferBps: 0,
        confirmTicks: 2,
        quoteValidityTarget: 'MIN_1',
        quoteValidityDeadline: 'MIN_1',
        autosettleCutoff: '14:00',
      },
    });
    const json = bill.toJSON() as {
      billAmount: string;
      strategy: { targetPrice: string };
    };
    expect(json.billAmount).toBe('250000');
    expect(json.strategy.targetPrice).toBe('1.075');
    expect(fromDecimal128(toDecimal128('1.075')).eq(D('1.075'))).toBe(true);
    expect(JSON.stringify(json)).not.toContain('Decimal128');
  });
});
