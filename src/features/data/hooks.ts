'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ArmBody, PutStrategyBody } from '@/contracts/api';
import type { BillSummary } from '@/contracts/bill';
import type { ChartRange } from '@/contracts/chart';
import { DataSourceError } from '@/contracts/data-source';
import type { AppEvent } from '@/contracts/sse';
import { dataSource, getDataSource } from '@/features/data/source';
import { qk } from '@/features/data/keys';
import { useUiStore } from '@/features/ui-store';

export type FeedConnection = 'simulated' | 'delayed' | 'offline';

function patchBill(list: BillSummary[] | undefined, bill: BillSummary) {
  if (!list) return list;
  const index = list.findIndex((item) => item.id === bill.id);
  if (index === -1) return [...list, bill];
  const next = list.slice();
  next[index] = bill;
  return next;
}

export function useBills() {
  return useQuery({
    queryKey: qk.bills,
    queryFn: () => dataSource().listBills(),
  });
}

export function useBill(id: string | undefined) {
  return useQuery({
    queryKey: qk.bill(id ?? ''),
    queryFn: () => dataSource().getBill(id ?? ''),
    enabled: Boolean(id),
  });
}

export function useChart(id: string | undefined, range: ChartRange) {
  return useQuery({
    queryKey: qk.chart(id ?? '', range),
    queryFn: () => dataSource().getChart(id ?? '', { range }),
    enabled: Boolean(id),
  });
}

export function useEvents(id: string | undefined) {
  return useQuery({
    queryKey: qk.events(id ?? ''),
    queryFn: () => dataSource().listEvents(id ?? ''),
    enabled: Boolean(id),
  });
}

export function useBalances() {
  return useQuery({
    queryKey: qk.balances,
    queryFn: () => dataSource().getBalances(),
  });
}

export function useStream() {
  const client = useQueryClient();
  const speed = useUiStore((state) => state.marketSpeed);
  const [connection, setConnection] = useState<FeedConnection>('simulated');
  const [notices, setNotices] = useState<AppEvent[]>([]);
  const [now, setNow] = useState(() => getDataSource().clock.now().toISOString());

  useEffect(() => {
    const source = getDataSource();
    let lastTick = Date.now();
    const unsub = source.subscribe((event) => {
      if (event.type === 'tick') {
        lastTick = Date.now();
        setConnection('simulated');
        const bills = client.getQueryData<BillSummary[]>(qk.bills);
        if (!bills) return;
        const next = bills.map((bill) =>
          bill.pair.base === event.pair.base &&
          bill.pair.quote === event.pair.quote &&
          bill.lastPrice
            ? { ...bill, lastPrice: event.price, flags: { ...bill.flags, stale: false } }
            : bill,
        );
        client.setQueryData(qk.bills, next);
        for (const bill of next) {
          if (bill.lastPrice !== event.price) continue;
          if (bill.pair.base !== event.pair.base || bill.pair.quote !== event.pair.quote) continue;
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
        client.setQueryData(qk.bills, (list: BillSummary[] | undefined) =>
          patchBill(list, event.bill),
        );
        client.setQueryData(qk.bill(event.bill.id), (detail: unknown) =>
          detail && typeof detail === 'object'
            ? { ...detail, ...event.bill }
            : detail,
        );
        void client.invalidateQueries({ queryKey: qk.events(event.bill.id) });
        return;
      }
      if (event.type === 'notification') {
        setNotices((current) => [event, ...current].slice(0, 20));
      }
      if (event.type === 'clock') setNow(event.now);
    });
    const interval = window.setInterval(() => {
      source.stepMarket();
      source.pump();
      setNow(source.clock.now().toISOString());
      if (Date.now() - lastTick > 2_000) setConnection('delayed');
    }, 500 / Number(speed));
    return () => {
      unsub();
      window.clearInterval(interval);
    };
  }, [client, speed]);

  return { connection, notices, now };
}

export function useBillActions() {
  const client = useQueryClient();

  async function apply(run: () => Promise<BillSummary>) {
    try {
      const bill = await run();
      client.setQueryData(qk.bills, (list: BillSummary[] | undefined) => patchBill(list, bill));
      client.setQueryData(qk.bill(bill.id), (detail: unknown) =>
        detail && typeof detail === 'object' ? { ...detail, ...bill } : detail,
      );
      void client.invalidateQueries({ queryKey: qk.balances });
      void client.invalidateQueries({ queryKey: qk.events(bill.id) });
      return bill;
    } catch (error) {
      const message = error instanceof DataSourceError ? error.message : 'That action failed.';
      throw new Error(message);
    }
  }

  return {
    arm: (id: string, body: ArmBody) => apply(() => dataSource().arm(id, body)),
    pause: (id: string) => apply(() => dataSource().pause(id)),
    resume: (id: string) => apply(() => dataSource().resume(id)),
    payNow: (id: string) => apply(() => dataSource().payNow(id)),
    cancel: (id: string) => apply(() => dataSource().cancel(id)),
    rearm: (id: string) => apply(() => dataSource().rearm(id)),
    simulate: (id: string) => apply(() => dataSource().simulate(id)),
    stop: (id: string) => apply(() => dataSource().stopSimulation(id)),
    advance: (id: string) => apply(() => dataSource().advanceTransfer(id)),
    putStrategy: (id: string, body: PutStrategyBody) =>
      apply(() => dataSource().putStrategy(id, body)),
  };
}
