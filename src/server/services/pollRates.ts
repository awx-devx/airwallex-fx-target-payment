import type { AppEvent } from '@/contracts/sse';
import { decimalString } from '@/contracts/money';
import type { RateSource } from '@/server/adapters/rates';
import type { Clock } from '@/server/adapters/clock';
import { fromDecimal128, toDecimal128 } from '@/server/db/decimal';
import { Bill, RateTick } from '@/server/db/models';
import type { Env } from '@/server/env';

interface WatchingBill {
  _id: { toString(): string };
  billCurrency: string;
  homeCurrency: string;
  billAmount: { toString(): string };
}

/** One poll of every watching or paused bill. Same pair and amount share one rate call. */
export async function pollWatchingBills(input: {
  env: Env;
  clock: Clock;
  source: RateSource;
  publish?: (event: AppEvent) => Promise<void>;
}): Promise<void> {
  const bills = (await Bill.find({ state: { $in: ['WATCHING', 'PAUSED'] } }).lean()) as WatchingBill[];
  if (bills.length === 0) return;
  input.source.prepare?.(input.clock.now().getTime());
  const groups = new Map<string, { buy: string; sell: string; amount: string; ids: string[] }>();
  for (const bill of bills) {
    const amount = decimalString(fromDecimal128(bill.billAmount));
    const key = `${bill.billCurrency}|${bill.homeCurrency}|${amount}`;
    const group = groups.get(key) ?? {
      buy: bill.billCurrency,
      sell: bill.homeCurrency,
      amount,
      ids: [],
    };
    group.ids.push(String(bill._id));
    groups.set(key, group);
  }
  const at = input.clock.now();
  for (const group of groups.values()) {
    try {
      const rate = await input.source.getIndicative({
        buy: group.buy,
        sell: group.sell,
        buyAmount: group.amount,
      });
      await RateTick.create({
        ts: at,
        meta: { base: group.buy, quote: group.sell, source: rate.source },
        price: toDecimal128(rate.price),
      });
      await Bill.updateMany(
        { _id: { $in: group.ids } },
        { $set: { last: { price: toDecimal128(rate.price), at, source: rate.source } } },
      );
      for (const billId of group.ids) {
        await input.publish?.({
          type: 'tick',
          pair: { base: group.buy, quote: group.sell },
          billId,
          ts: at.toISOString(),
          price: rate.price,
          source: rate.source,
        });
      }
    } catch {
      // A failed read leaves the previous tick in place, so the bill reads as stale.
    }
  }
}
