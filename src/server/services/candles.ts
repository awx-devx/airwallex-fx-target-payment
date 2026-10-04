import { decimalString } from '@/contracts/money';
import { instant } from '@/server/adapters/clock';
import { fromDecimal128, toDecimal128 } from '@/server/db/decimal';
import { RateCandle, RateTick } from '@/server/db/models';

interface RollupRow {
  _id: { base: string; quote: string; t: Date };
  o: { toString(): string };
  h: { toString(): string };
  l: { toString(): string };
  c: { toString(): string };
}

/** Write the previous complete minute of ticks into `rate_candles_1m`. */
export async function rollupMinute(now: Date): Promise<number> {
  const end = instant(Math.floor(now.getTime() / 60_000) * 60_000);
  const start = instant(end.getTime() - 60_000);
  const rows = (await RateTick.aggregate([
    { $match: { ts: { $gte: start, $lt: end } } },
    { $sort: { ts: 1 } },
    {
      $group: {
        _id: {
          base: '$meta.base',
          quote: '$meta.quote',
          t: { $dateTrunc: { date: '$ts', unit: 'minute' } },
        },
        o: { $first: '$price' },
        h: { $max: '$price' },
        l: { $min: '$price' },
        c: { $last: '$price' },
      },
    },
  ])) as RollupRow[];
  for (const row of rows) {
    const price = (value: { toString(): string }) => toDecimal128(decimalString(fromDecimal128(value)));
    await RateCandle.updateOne(
      { base: row._id.base, quote: row._id.quote, t: row._id.t },
      { $setOnInsert: { o: price(row.o), h: price(row.h), l: price(row.l), c: price(row.c) } },
      { upsert: true },
    );
  }
  return rows.length;
}
