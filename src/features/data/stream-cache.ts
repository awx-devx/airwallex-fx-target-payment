import type { QueryClient } from '@tanstack/react-query';
import type { BillSummary } from '@/contracts/bill';
import type { AppEvent } from '@/contracts/sse';
import { qk } from '@/features/data/keys';

function patchBill(list: BillSummary[] | undefined, bill: BillSummary) {
  if (!list) return list;
  const index = list.findIndex((item) => item.id === bill.id);
  if (index === -1) return [...list, bill];
  const next = list.slice();
  next[index] = bill;
  return next;
}

type CachedChart = {
  series: { time: number; value: string }[];
  overlays: { simulatedRanges?: { from: number; to?: number }[] };
};

function tickHits(bill: BillSummary, event: Extract<AppEvent, { type: 'tick' }>): boolean {
  if (event.billId) return bill.id === event.billId;
  return bill.pair.base === event.pair.base && bill.pair.quote === event.pair.quote && Boolean(bill.lastPrice);
}

function upsertPoint(
  series: { time: number; value: string }[],
  time: number,
  value: string,
): { time: number; value: string }[] {
  const index = series.findIndex((point) => point.time === time);
  if (index >= 0) {
    const next = series.slice();
    next[index] = { time, value };
    return next;
  }
  const last = series[series.length - 1];
  if (last && last.time > time) return series;
  return series.concat({ time, value });
}

function extendSession<T extends { simulatedRanges?: { from: number; to?: number }[] }>(
  overlays: T,
  time: number,
): T {
  const ranges = overlays.simulatedRanges ?? [];
  const covered = ranges.some((span) => time >= span.from && (span.to === undefined || time <= span.to));
  if (covered) return overlays;
  return { ...overlays, simulatedRanges: [...ranges, { from: time }] };
}

export function applyAppEvent(client: QueryClient, event: AppEvent): void {
  if (event.type === 'tick') {
    const bills = client.getQueryData<BillSummary[]>(qk.bills);
    if (!bills) return;
    const next = bills.map((bill) =>
      tickHits(bill, event)
        ? { ...bill, lastPrice: event.price, flags: { ...bill.flags, stale: false } }
        : bill,
    );
    client.setQueryData(qk.bills, next);
    const time = Math.floor(Date.parse(event.ts) / 1000);
    for (const bill of next) {
      if (!tickHits(bill, event)) continue;
      client.setQueryData(qk.bill(bill.id), (detail: { lastPrice?: string } | undefined) =>
        detail ? { ...detail, lastPrice: event.price } : detail,
      );
      client.setQueriesData({ queryKey: ['chart', bill.id] }, (chart: CachedChart | undefined) => {
        if (!chart) return chart;
        return {
          ...chart,
          series: upsertPoint(chart.series, time, event.price).slice(-400),
          overlays: event.simId ? extendSession(chart.overlays, time) : chart.overlays,
        };
      });
    }
    return;
  }
  if (event.type === 'bill.updated') {
    client.setQueryData(qk.bills, (list: BillSummary[] | undefined) => patchBill(list, event.bill));
    client.setQueryData(qk.bill(event.bill.id), (detail: unknown) =>
      detail && typeof detail === 'object' ? { ...detail, ...event.bill } : detail,
    );
    void client.invalidateQueries({ queryKey: qk.events(event.bill.id) });
    return;
  }
  if (event.type === 'extraction.progress') {
    void client.invalidateQueries({ queryKey: qk.bill(event.billId) });
    void client.invalidateQueries({ queryKey: qk.bills });
    return;
  }
  if (event.type === 'execution.updated') {
    void client.invalidateQueries({ queryKey: qk.bill(event.billId) });
    void client.invalidateQueries({ queryKey: qk.events(event.billId) });
    void client.invalidateQueries({ queryKey: qk.bills });
  }
}
