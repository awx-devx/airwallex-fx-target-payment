import type { AppEvent } from '@/contracts/sse';
import { decimalString } from '@/contracts/money';
import type { RateSource } from '@/server/adapters/rates';
import type { Clock } from '@/server/adapters/clock';
import { fromDecimal128, toDecimal128 } from '@/server/db/decimal';
import { Bill, RateTick } from '@/server/db/models';
import type { Env } from '@/server/env';
import { getLogger } from '@/server/logging/logger';
import { considerTick } from '@/server/services/strategy';

interface WatchingBill {
  _id: { toString(): string };
  state: string;
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
  const groups = new Map<
    string,
    { buy: string; sell: string; amount: string; members: { id: string; state: string }[] }
  >();
  for (const bill of bills) {
    const amount = decimalString(fromDecimal128(bill.billAmount));
    const key = `${bill.billCurrency}|${bill.homeCurrency}|${amount}`;
    const group = groups.get(key) ?? {
      buy: bill.billCurrency,
      sell: bill.homeCurrency,
      amount,
      members: [],
    };
    group.members.push({ id: String(bill._id), state: bill.state });
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
      const tick = await RateTick.create({
        ts: at,
        meta: { base: group.buy, quote: group.sell, source: rate.source },
        price: toDecimal128(rate.price),
      });
      const ids = group.members.map((member) => member.id);
      await Bill.updateMany(
        { _id: { $in: ids } },
        { $set: { last: { price: toDecimal128(rate.price), at, source: rate.source } } },
      );
      for (const billId of ids) {
        await input.publish?.({
          type: 'tick',
          pair: { base: group.buy, quote: group.sell },
          billId,
          ts: at.toISOString(),
          price: rate.price,
          source: rate.source,
        });
      }
      for (const member of group.members) {
        if (member.state !== 'WATCHING') continue;
        try {
          await considerTick({
            env: input.env,
            clock: input.clock,
            billId: member.id,
            tick: { id: String(tick._id), price: rate.price, at, source: rate.source },
          });
        } catch (error) {
          getLogger().warn({ err: error, billId: member.id }, 'trigger evaluation failed');
        }
      }
    } catch {
      // A failed read leaves the previous tick in place, so the bill reads as stale.
    }
  }
}
