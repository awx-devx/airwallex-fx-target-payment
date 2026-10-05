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

export function applyAppEvent(client: QueryClient, event: AppEvent): void {
  if (event.type === 'tick') {
    const bills = client.getQueryData<BillSummary[]>(qk.bills);
    if (!bills) return;
    const next = bills.map((bill) =>
      bill.pair.base === event.pair.base && bill.pair.quote === event.pair.quote && bill.lastPrice
        ? { ...bill, lastPrice: event.price, flags: { ...bill.flags, stale: false } }
        : bill,
    );
    client.setQueryData(qk.bills, next);
    for (const bill of next) {
      if (bill.pair.base !== event.pair.base || bill.pair.quote !== event.pair.quote) continue;
      if (bill.lastPrice !== event.price) continue;
      client.setQueryData(qk.bill(bill.id), (detail: { lastPrice?: string } | undefined) =>
        detail ? { ...detail, lastPrice: event.price } : detail,
      );
      client.setQueryData(
        qk.chart(bill.id, 'TO_DUE'),
        (chart: { series: { time: number; value: string }[] } | undefined) => {
          if (!chart) return chart;
          const last = chart.series[chart.series.length - 1];
          const time = (last?.time ?? 0) + 1;
          const series =
            last && last.time >= time
              ? chart.series.slice(0, -1).concat({ time: last.time, value: event.price })
              : chart.series.concat({ time, value: event.price });
          return { ...chart, series: series.slice(-400) };
        },
      );
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
  if (event.type === 'execution.updated') {
    void client.invalidateQueries({ queryKey: qk.bill(event.billId) });
    void client.invalidateQueries({ queryKey: qk.events(event.billId) });
    void client.invalidateQueries({ queryKey: qk.bills });
  }
}
