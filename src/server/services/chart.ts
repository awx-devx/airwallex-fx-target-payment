import { chartResponseSchema, type ChartRange, type ChartResponse, type ChartSeriesPoint } from '@/contracts/chart';
import type { ChartMarkerKind } from '@/contracts/chart';
import { decimalString } from '@/contracts/money';
import { instant, type Clock } from '@/server/adapters/clock';
import { fromDecimal128 } from '@/server/db/decimal';
import { Bill, BillEvent, Quote, RateTick } from '@/server/db/models';
import type { Env } from '@/server/env';
import { notFound } from '@/server/services/errors';
import { referenceSeries } from '@/server/services/history';
import mongoose from 'mongoose';

const MARKERS: Partial<Record<string, ChartMarkerKind>> = {
  ARMED: 'ARMED',
  NEAR_MISS: 'NEAR_MISS',
  QUOTE_LOCKED: 'TARGET_HIT',
  AUTOSETTLE: 'AUTOSETTLE',
  TRANSFER_CREATED: 'EXECUTED',
  PAID: 'EXECUTED',
  SIM_STARTED: 'SIM_START',
  SIM_ENDED: 'SIM_END',
};

export async function billChart(input: {
  billId: string;
  range: ChartRange;
  env: Env;
  clock: Clock;
}): Promise<ChartResponse> {
  if (!mongoose.isValidObjectId(input.billId)) throw notFound();
  const bill = await Bill.findById(input.billId).lean();
  if (!bill) throw notFound();
  const now = input.clock.now();
  const span = rangeWindow(input.range, bill.dueDate, bill.executionDeadline, now);
  const series = await seriesFor(bill.billCurrency, bill.homeCurrency, span.from, span.to, span.unit);
  const reference = await referenceSeries(
    input.env,
    { base: bill.billCurrency, quote: bill.homeCurrency },
    span.from.toISOString().slice(0, 10),
    span.to.toISOString().slice(0, 10),
  );
  const events = await BillEvent.find({ billId: bill._id }).sort({ ts: 1 }).lean();
  const quote = await Quote.findOne({ billId: bill._id, validToAt: { $gt: now } }).sort({ validToAt: -1 }).lean();
  const overlays = {
    ...(bill.entry ? { entry: decimalString(fromDecimal128(bill.entry.price)) } : {}),
    ...(bill.strategy ? { target: decimalString(fromDecimal128(bill.strategy.targetPrice)) } : {}),
    ...(quote
      ? {
          quote: {
            price: decimalString(fromDecimal128(quote.price)),
            from: seconds(quote.validFromAt),
            to: seconds(quote.validToAt),
          },
        }
      : {}),
    executionDeadline: seconds(bill.executionDeadline),
    dueDate: seconds(bill.dueDate),
    now: seconds(now),
    markers: events.flatMap((event) => {
      const kind = MARKERS[event.type];
      if (!kind) return [];
      return [{ time: seconds(event.ts), kind }];
    }),
  };
  return chartResponseSchema.parse({
    series,
    overlays,
    ...(reference.length > 0 ? { reference } : {}),
  });
}

function rangeWindow(
  range: ChartRange,
  due: Date,
  deadline: Date,
  now: Date,
): { from: Date; to: Date; unit: 'minute' | 'hour' | 'day' } {
  const day = 86_400_000;
  if (range === '1D') return { from: instant(now.getTime() - day), to: now, unit: 'minute' };
  if (range === '5D') return { from: instant(now.getTime() - 5 * day), to: now, unit: 'minute' };
  if (range === '1M') return { from: instant(now.getTime() - 30 * day), to: now, unit: 'hour' };
  if (range === '3M') return { from: instant(now.getTime() - 90 * day), to: now, unit: 'day' };
  const from = deadline.getTime() < now.getTime() ? deadline : instant(now.getTime() - day);
  const end = due.getTime() < now.getTime() ? due : now;
  return { from, to: end.getTime() < from.getTime() ? now : end, unit: end.getTime() - from.getTime() > 2 * day ? 'hour' : 'minute' };
}

async function seriesFor(
  base: string,
  quote: string,
  from: Date,
  to: Date,
  unit: 'minute' | 'hour' | 'day',
): Promise<ChartSeriesPoint[]> {
  const rows = (await RateTick.aggregate([
    { $match: { 'meta.base': base, 'meta.quote': quote, ts: { $gte: from, $lte: to } } },
    { $sort: { ts: 1 } },
    {
      $group: {
        _id: { $dateTrunc: { date: '$ts', unit } },
        value: { $last: '$price' },
      },
    },
    { $sort: { _id: 1 } },
  ])) as { _id: Date; value: { toString(): string } }[];
  return rows.map((row) => ({
    time: seconds(row._id),
    value: decimalString(fromDecimal128(row.value)),
  }));
}

function seconds(value: Date): number {
  return Math.floor(value.getTime() / 1000);
}
