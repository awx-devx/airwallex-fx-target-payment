'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ArmBody, PatchBillBody, PutStrategyBody, ResolveBeneficiaryBody } from '@/contracts/api';
import type { BillSummary } from '@/contracts/bill';
import type { ChartRange } from '@/contracts/chart';
import { DataSourceError } from '@/contracts/data-source';
import type { AppEvent } from '@/contracts/sse';
import { billWithState, billWithStrategy } from '@/features/data/optimistic';
import { dataSource, getDataSource, isApiDataSource } from '@/features/data/source';
import { qk } from '@/features/data/keys';
import { feedLabel, noteStreamEvent, noteStreamHealth, type FeedLabelState } from '@/features/data/feed';
import { connectStream } from '@/features/data/stream';
import { applyAppEvent } from '@/features/data/stream-cache';
import { useUiStore } from '@/features/ui-store';

export type { FeedConnection, FeedKind } from '@/features/data/feed';

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

function rememberNotice(setNotices: (update: (current: AppEvent[]) => AppEvent[]) => void, event: AppEvent) {
  if (event.type !== 'notification') return;
  setNotices((current) => [event, ...current].slice(0, 20));
}

export function useStream() {
  const client = useQueryClient();
  const speed = useUiStore((state) => state.marketSpeed);
  const api = isApiDataSource();
  // API mode starts on the Airwallex feed. The hello event corrects it when the
  // server is actually on the simulated walk. Mock mode is simulated throughout.
  const [label, setLabel] = useState<FeedLabelState>({
    feed: api ? 'AIRWALLEX' : 'SIMULATED',
    health: 'live',
  });
  const [notices, setNotices] = useState<AppEvent[]>([]);
  // Display clock only. The API path uses the browser until the first clock event.
  const [now, setNow] = useState(() =>
    api ? new Date().toISOString() : getDataSource().clock.now().toISOString(),
  );

  useEffect(() => {
    if (isApiDataSource()) {
      return connectStream({
        onEvent: (event) => {
          setLabel((current) => noteStreamEvent(current, event));
          if (event.type === 'hello' || event.type === 'clock') setNow(event.now);
          rememberNotice(setNotices, event);
          applyAppEvent(client, event);
        },
        onStatus: (status) => {
          setLabel((current) => noteStreamHealth(current, status));
        },
        onPoll: () => {
          void client.invalidateQueries({ queryKey: qk.bills });
          void client.invalidateQueries({ queryKey: qk.balances });
        },
      });
    }
    const source = getDataSource();
    let lastTick = Date.now();
    const unsub = source.subscribe((event) => {
      if (event.type === 'tick') {
        lastTick = Date.now();
        setLabel((current) => noteStreamHealth(current, 'live'));
      }
      if (event.type === 'clock') setNow(event.now);
      rememberNotice(setNotices, event);
      applyAppEvent(client, event);
    });
    const interval = window.setInterval(() => {
      source.stepMarket();
      source.pump();
      setNow(source.clock.now().toISOString());
      if (Date.now() - lastTick > 2_000) setLabel((current) => noteStreamHealth(current, 'delayed'));
    }, 500 / Number(speed));
    return () => {
      unsub();
      window.clearInterval(interval);
    };
  }, [client, speed]);

  return { connection: feedLabel(label), feed: label.feed, notices, now };
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
      if (error instanceof DataSourceError && error.error.code === 'INVALID_STATE') {
        void client.invalidateQueries({ queryKey: qk.bills });
        void client.invalidateQueries({ queryKey: ['bill'] });
      }
      if (error instanceof DataSourceError) throw error;
      throw new Error('That action failed.');
    }
  }

  async function optimistic(
    id: string,
    patch: (bill: BillSummary) => BillSummary,
    run: () => Promise<BillSummary>,
  ) {
    const previousList = client.getQueryData<BillSummary[]>(qk.bills);
    const previousDetail = client.getQueryData(qk.bill(id));
    const current =
      previousList?.find((bill) => bill.id === id) ??
      (previousDetail && typeof previousDetail === 'object' && 'state' in previousDetail
        ? (previousDetail as BillSummary)
        : undefined);
    if (current) {
      const next = patch(current);
      client.setQueryData(qk.bills, (list: BillSummary[] | undefined) => patchBill(list, next));
      client.setQueryData(qk.bill(id), (detail: unknown) =>
        detail && typeof detail === 'object' ? { ...detail, ...next } : detail,
      );
    }
    try {
      return await apply(run);
    } catch (error) {
      client.setQueryData(qk.bills, previousList);
      client.setQueryData(qk.bill(id), previousDetail);
      throw error;
    }
  }

  return {
    arm: (id: string, body: ArmBody) => apply(() => dataSource().arm(id, body)),
    pause: (id: string) => optimistic(id, (bill) => billWithState(bill, 'PAUSED'), () => dataSource().pause(id)),
    resume: (id: string) =>
      optimistic(id, (bill) => billWithState(bill, 'WATCHING'), () => dataSource().resume(id)),
    payNow: (id: string) => apply(() => dataSource().payNow(id)),
    cancel: (id: string) => apply(() => dataSource().cancel(id)),
    rearm: (id: string) => apply(() => dataSource().rearm(id)),
    simulate: (id: string) => apply(() => dataSource().simulate(id)),
    stop: (id: string) => apply(() => dataSource().stopSimulation(id)),
    advance: (id: string) => apply(() => dataSource().advanceTransfer(id)),
    resolveBeneficiary: (id: string, body: ResolveBeneficiaryBody) =>
      apply(() => dataSource().resolveBeneficiary(id, body)),
    review: (id: string) => apply(() => dataSource().review(id)),
    patch: (id: string, body: PatchBillBody) => apply(() => dataSource().patchBill(id, body)),
    putStrategy: (id: string, body: PutStrategyBody) =>
      optimistic(id, (bill) => billWithStrategy(bill, body), () => dataSource().putStrategy(id, body)),
  };
}
