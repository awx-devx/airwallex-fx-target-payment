'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BillAction, BillSummary } from '@/contracts/bill';
import { CHART_RANGES } from '@/contracts/chart';
import {
  useBalances,
  useBill,
  useBillActions,
  useBills,
  useChart,
  useEvents,
  useStream,
} from '@/features/data/hooks';
import { getDataSource } from '@/features/data/source';
import { useUiStore } from '@/features/ui-store';
import { AuroraBand } from '@/ui/patterns/grain-aurora';
import { BillList, type BillRow } from '@/ui/patterns/bill-list';
import { filterBills, sortBills } from '@/ui/patterns/bill-list-logic';
import { BillTicket } from '@/ui/patterns/bill-ticket';
import { CommandPalette, type CommandItem } from '@/ui/patterns/command-palette';
import { DemoControlBar } from '@/ui/patterns/demo-control-bar';
import { PositionsPanel } from '@/ui/patterns/positions';
import { ShortcutsSheet } from '@/ui/patterns/shortcuts-sheet';
import { UploadModal, type UploadPhase } from '@/ui/patterns/upload-modal';
import { FxChart } from '@/ui/chart/fx-chart';
import { Banner } from '@/ui/primitives/banner';
import { Button } from '@/ui/primitives/button';
import { Dialog } from '@/ui/primitives/dialog';
import { Drawer } from '@/ui/primitives/dialog';
import { AccountStrip, TopBar } from '@/ui/patterns/top-bar';
import { EmptyState } from '@/ui/primitives/empty-state';
import type { DropFile } from '@/ui/primitives/file-dropzone';
import { useToasts } from '@/ui/primitives/toast';
import { ApprovalCard } from '@/ui/patterns/approval-card';
import { Menu, PanelRight } from 'lucide-react';
import type { AppEvent } from '@/contracts/sse';

function useWidth() {
  const [width, setWidth] = useState(1440);
  useEffect(() => {
    const read = () => setWidth(window.innerWidth);
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);
  return width;
}

export function TerminalScreen({
  billId,
  approvalId,
}: {
  billId?: string;
  approvalId?: string;
}) {
  const router = useRouter();
  const width = useWidth();
  const bills = useBills();
  const balances = useBalances();
  const { connection, notices, now } = useStream();
  const actions = useBillActions();
  const toasts = useToasts();
  const ui = useUiStore();
  const selectedId = billId ?? bills.data?.[0]?.id;
  const detail = useBill(selectedId);
  const chart = useChart(selectedId, ui.range);
  const events = useEvents(selectedId);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle');
  const [uploadFiles, setUploadFiles] = useState<DropFile[]>([]);
  const toasted = useRef(0);

  const rows: BillRow[] = useMemo(
    () =>
      (bills.data ?? []).map((bill) => ({
        bill,
        sparkline: bill.lastPrice ? [bill.lastPrice, bill.lastPrice] : [],
      })),
    [bills.data],
  );

  const ordered = useMemo(() => {
    const matched = rows.filter((row) => {
      const needle = ui.query.trim().toLowerCase();
      if (!needle) return true;
      return (
        row.bill.vendorName.toLowerCase().includes(needle) ||
        row.bill.invoiceNumber.toLowerCase().includes(needle)
      );
    });
    return sortBills(
      filterBills(
        matched.map((row) => row.bill),
        ui.filter,
      ),
      ui.sort,
    );
  }, [rows, ui.query, ui.filter, ui.sort]);

  const selected = detail.data ?? bills.data?.find((bill) => bill.id === selectedId);
  const approvalBill =
    bills.data?.find((bill) => bill.activeApproval?.id === approvalId) ?? selected;

  function select(id: string) {
    ui.setListOpen(false);
    router.push(`/bills/${id}`);
  }

  function onOpenTicket(bill: BillSummary) {
    select(bill.id);
    ui.setTicketOpen(true);
  }

  function onRowAction(bill: BillSummary, action: BillAction) {
    select(bill.id);
    const opensTicket =
      action === 'REVIEW' ||
      action === 'EDIT' ||
      action === 'EDIT_STRATEGY' ||
      (action === 'RESOLVE_BENEFICIARY' && bill.state !== 'FAILED');
    if (opensTicket) {
      ui.setTicketOpen(true);
      return;
    }
    void onAction(action, bill);
  }

  async function onAction(action: string, bill: BillSummary | undefined = selected) {
    if (!bill) return;
    try {
      if (action === 'ARM') {
        await actions.arm(bill.id, {
          standingInstruction: true,
          transferMethod: bill.transferMethod,
          transferReason: bill.transferReason,
          reference: bill.reference ?? bill.invoiceNumber,
        });
      } else if (action === 'PAUSE') await actions.pause(bill.id);
      else if (action === 'RESUME') await actions.resume(bill.id);
      else if (action === 'PAY_NOW') await actions.payNow(bill.id);
      else if (action === 'CANCEL') await actions.cancel(bill.id);
      else if (action === 'APPROVE' && bill.activeApproval) {
        await actions.approve(bill.activeApproval.id);
        toasts.push({ tone: 'success', title: 'Approved' });
      } else if (action === 'HOLD' && bill.activeApproval) {
        await actions.reject(bill.activeApproval.id, { action: 'HOLD' });
      } else if (action === 'RESOLVE_BENEFICIARY' || action === 'REARM') {
        await actions.rearm(bill.id);
      } else if (action === 'SIMULATE') await actions.simulate(bill.id);
      else if (action === 'STOP_SIMULATION') await actions.stop(bill.id);
      else if (action === 'ADVANCE_TRANSFER') await actions.advance(bill.id);
    } catch (error) {
      toasts.push({
        tone: 'error',
        title: 'Could not do that',
        body: error instanceof Error ? error.message : undefined,
      });
    }
  }

  useEffect(() => {
    if (notices.length <= toasted.current) return;
    const fresh = notices.slice(0, notices.length - toasted.current);
    toasted.current = notices.length;
    if (!fresh.some((event) => event.type === 'approval.requested')) return;
    toasts.push({
      tone: 'target-hit',
      title: 'Target hit',
      body: 'A quote is waiting for approval.',
    });
  }, [notices, toasts]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select')) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault();
        ui.setPalette(true);
        return;
      }
      if (key === 'j' || key === 'k') {
        const index = ordered.findIndex((bill) => bill.id === selectedId);
        const next = ordered[index + (key === 'j' ? 1 : -1)];
        if (next) select(next.id);
      } else if (key === '/') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('[aria-label="Search bills"]')?.focus();
      } else if (key === 'u') ui.setUpload(true);
      else if (key === 'a') void onAction('APPROVE');
      else if (key === 'h') void onAction('HOLD');
      else if (key === 'p') {
        void onAction(selected?.state === 'PAUSED' ? 'RESUME' : 'PAUSE');
      } else if (key === 't') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('[aria-label="Target rate"]')?.focus();
      } else if (key === 'g') ui.setGrouped(!ui.grouped);
      else if (key === '?') ui.setShortcuts(true);
      else if (key === '`') ui.setDemoOpen(!ui.demoOpen);
      else if (key >= '1' && key <= '5') {
        const range = CHART_RANGES[Number(key) - 1];
        if (range) ui.setRange(range);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const showList = width >= 1024;
  const stack = width < 1024;
  const commands: CommandItem[] = [
    { id: 'upload', group: 'Actions', label: 'Upload bills', hint: 'U' },
    { id: 'approve', group: 'Actions', label: 'Approve active quote', hint: 'A' },
    ...(bills.data ?? []).map((bill) => ({
      id: bill.id,
      group: 'Bills',
      label: `${bill.vendorName} · ${bill.invoiceNumber}`,
    })),
  ];

  function onPick(item: CommandItem) {
    ui.setPalette(false);
    if (item.id === 'upload') ui.setUpload(true);
    else if (item.id === 'approve') void onAction('APPROVE');
    else select(item.id);
  }

  function startSamples(count: number) {
    const files: DropFile[] = Array.from({ length: count }, (_, index) => ({
      name: `sample-${index + 1}.pdf`,
      progress: 30,
      extraction: 'working',
    }));
    setUploadFiles(files);
    setUploadPhase('extracting');
    window.setTimeout(() => {
      setUploadFiles((current) => current.map((file) => ({ ...file, progress: 60, extraction: 'searching' })));
    }, 400);
    window.setTimeout(() => {
      setUploadFiles((current) => current.map((file) => ({ ...file, progress: 80, extraction: 'solving' })));
    }, 800);
    window.setTimeout(() => {
      setUploadFiles((current) => current.map((file) => ({ ...file, progress: 100, extraction: undefined })));
    }, 1200);
  }

  const list = (
    <div className="flex h-full min-h-0 flex-col">
      {width < 1280 ? (
        <AccountStrip
          balances={balances.data ?? []}
          connection={connection === 'delayed' ? 'delayed' : 'simulated'}
          role={ui.role}
          onRoleChange={ui.setRole}
          now={now}
        />
      ) : null}
      <div className="min-h-0 flex-1">
        <BillList
          rows={rows}
          now={now}
          selectedId={selectedId}
          onSelect={select}
          filter={ui.filter}
          onFilterChange={ui.setFilter}
          sort={ui.sort}
          onSortChange={ui.setSort}
          grouped={ui.grouped}
          onGroupedChange={ui.setGrouped}
          query={ui.query}
          onQueryChange={ui.setQuery}
          loading={bills.isLoading}
          onUpload={() => ui.setUpload(true)}
          layout="rail"
        />
      </div>
    </div>
  );

  const ticket = selected ? (
    <BillTicket
      bill={selected}
      now={now}
      events={events.data ?? detail.data?.events ?? []}
      role={ui.role}
      homeCurrency="USD"
      cutoffLabel="14:00 Los Angeles"
      onAction={(action) => void onAction(action)}
    />
  ) : null;

  return (
    <div className="relative isolate flex h-dvh flex-col overflow-clip bg-bg-0 text-fg-1">
      <AuroraBand freeze={false} />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="border-b border-line-1">
          <div className="flex justify-center md:px-4 xl:px-6">
            <div className="w-full max-w-[1600px] border-line-1 md:border-x">
        <TopBar
          divider={false}
          balances={balances.data ?? []}
          connection={connection === 'delayed' ? 'delayed' : 'simulated'}
          unread={notices.length}
          role={ui.role}
          onRoleChange={ui.setRole}
          now={now}
          onNotifications={() => ui.setNoticesOpen(true)}
          leading={
            showList ? null : (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Open bill list"
                onClick={() => ui.setListOpen(true)}
                icon={<Menu strokeWidth={1.5} className="size-3.5" />}
              >
                <span className="hidden sm:inline">Bills</span>
              </Button>
            )
          }
          trailing={
            <Button
              size="sm"
              variant="ghost"
              aria-label="Open ticket"
              onClick={() => ui.setTicketOpen(true)}
              icon={<PanelRight strokeWidth={1.5} className="size-3.5" />}
            >
              <span className="hidden sm:inline">Ticket</span>
            </Button>
          }
          actions={
            <CommandPalette
              items={commands}
              open={ui.palette}
              onOpenChange={ui.setPalette}
              onPick={onPick}
              size="sm"
            />
          }
        />
            </div>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 justify-center md:px-4 xl:px-6">
        <div className="relative flex h-full min-h-0 w-full max-w-[1600px] flex-col border-line-1 md:border-x">
        {connection === 'delayed' ? (
          <Banner tone="warn">Reconnecting… prices may be stale.</Banner>
        ) : null}
        <div className="flex min-h-0 flex-1">
          {showList ? (
            <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-r border-line-1">{list}</aside>
          ) : null}
          <div className={stack ? 'flex min-w-0 flex-1 flex-col overflow-auto' : 'flex min-h-0 min-w-0 flex-1 flex-col'}>
            <div className={stack ? 'h-80 shrink-0' : 'min-h-0 flex-1'}>
              {!selected && !bills.isLoading ? (
                <EmptyState
                  title="Upload your first bills"
                  body="Or open a sample invoice to walk the arming flow."
                  action={
                    <Button onClick={() => ui.setUpload(true)}>Upload bills</Button>
                  }
                />
              ) : selected && chart.data ? (
                <FxChart
                  pair={selected.pair}
                  series={chart.data.series}
                  reference={chart.data.reference}
                  overlays={chart.data.overlays}
                  strategyMode={selected.strategyMode}
                  range={ui.range}
                  onRangeChange={ui.setRange}
                  type={ui.chartType}
                  onTypeChange={ui.setChartType}
                  height="fill"
                  state={connection === 'delayed' || selected.flags.stale ? 'stale' : 'ready'}
                  interactive={selected.state === 'WATCHING' || selected.state === 'READY'}
                  onTargetDrag={(price) => {
                    if (!selected.strategyMode) return;
                    void actions.putStrategy(selected.id, {
                      mode: selected.strategyMode,
                      targetPrice: price,
                    });
                  }}
                  connection={connection === 'delayed' ? 'delayed' : 'simulated'}
                  notional={{ amount: selected.amount, currency: selected.pair.base }}
                  maxCost={selected.maxCost}
                />
              ) : (
                <FxChart
                  pair={selected?.pair ?? { base: 'EUR', quote: 'USD' }}
                  series={[]}
                  overlays={{
                    executionDeadline: 0,
                    dueDate: 0,
                    now: 0,
                    markers: [],
                  }}
                  range={ui.range}
                  onRangeChange={ui.setRange}
                  type={ui.chartType}
                  onTypeChange={ui.setChartType}
                  state={bills.isLoading || chart.isLoading ? 'loading' : 'empty'}
                  height="fill"
                />
              )}
            </div>
            <div
              className={
                stack
                  ? 'shrink-0 border-t border-line-1'
                  : 'flex h-72 shrink-0 flex-col overflow-hidden border-t border-line-1'
              }
            >
              <PositionsPanel
                fill={!stack}
                bills={(bills.data ?? []).filter((bill) => placeBill(bill) === 'positions')}
                approvals={(bills.data ?? []).filter((bill) => placeBill(bill) === 'approvals')}
                executed={(bills.data ?? []).filter((bill) => placeBill(bill) === 'executed')}
                events={events.data ?? []}
                selectedId={selectedId}
                onSelect={select}
                onAction={onRowAction}
                onOpenTicket={onOpenTicket}
                loading={bills.isLoading}
              />
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute right-4 bottom-4 z-20">
          <div className="pointer-events-auto">
            <DemoControlBar
              expanded={ui.demoOpen}
              onExpandedChange={ui.setDemoOpen}
              speed={ui.marketSpeed}
              onSpeedChange={(speed) => ui.setMarketSpeed(speed as '1' | '10' | '60')}
              warp={ui.warp}
              onWarpChange={(next) => {
                const warp = next as '1' | '60' | '1440';
                ui.setWarp(warp);
                getDataSource().setWarp(Number(warp));
              }}
              onJump={() => {
                if (!selected) return;
                getDataSource().jumpToDeadline(selected.id);
              }}
              onNudge={() => {
                if (!selected) return;
                getDataSource().market.nudge(selected.pair.base, selected.pair.quote, -20);
                getDataSource().stepMarket();
              }}
              onSimulate={() => void onAction('SIMULATE')}
              onAdvance={() => void onAction('ADVANCE_TRANSFER')}
            />
          </div>
        </div>
      </div>
      </div>
      <UploadModal
        open={ui.upload}
        onOpenChange={ui.setUpload}
        phase={uploadPhase}
        files={uploadFiles}
        trigger={null}
        onSamples={startSamples}
        onReview={() => {
          ui.setUpload(false);
          const ready = bills.data?.find((bill) => bill.state === 'READY');
          if (ready) select(ready.id);
          toasts.push({ tone: 'success', title: 'Sample bill ready to arm' });
        }}
      />
      <Drawer open={ui.listOpen} onOpenChange={ui.setListOpen} title="Bills" side="right">
        {list}
      </Drawer>
      <Drawer open={ui.ticketOpen} onOpenChange={ui.setTicketOpen} title="Ticket" side="right" size="lg">
        {ticket}
      </Drawer>
      <Drawer open={ui.noticesOpen} onOpenChange={ui.setNoticesOpen} title="Alerts">
        <NoticeList
          notices={notices}
          bills={bills.data ?? []}
          onOpen={(id) => {
            ui.setNoticesOpen(false);
            select(id);
          }}
        />
      </Drawer>
      <Dialog open={ui.shortcuts} onOpenChange={ui.setShortcuts} title="Shortcuts">
        <ShortcutsSheet />
      </Dialog>
      <Dialog
        open={Boolean(approvalId && approvalBill)}
        onOpenChange={(open) => {
          if (!open && approvalBill) router.push(`/bills/${approvalBill.id}`);
        }}
        title={approvalBill?.vendorName ?? 'Approval'}
        description="Approval"
        tone="glow"
        size="lg"
      >
        {approvalBill ? (
          <ApprovalCard
            bill={approvalBill}
            now={now}
            role={ui.role}
            homeCurrency="USD"
            onApprove={() => void onAction('APPROVE', approvalBill)}
            onHold={() => void onAction('HOLD', approvalBill)}
          />
        ) : null}
      </Dialog>
      </div>
    </div>
  );
}

function placeBill(bill: BillSummary): 'positions' | 'approvals' | 'executed' {
  if (bill.state === 'TARGET_HIT' || bill.state === 'DEADLINE_WINDOW') return 'approvals';
  if (bill.state === 'IN_FLIGHT' || bill.state === 'PAID' || bill.state === 'FAILED' || bill.state === 'CANCELLED') {
    return 'executed';
  }
  return 'positions';
}

function NoticeList({
  notices,
  bills,
  onOpen,
}: {
  notices: readonly AppEvent[];
  bills: readonly BillSummary[];
  onOpen: (id: string) => void;
}) {
  if (notices.length === 0) return <p className="text-fg-3">No notifications.</p>;
  return (
    <ul className="space-y-2">
      {notices.map((notice, index) => {
        const id = 'billId' in notice ? notice.billId : undefined;
        const bill = bills.find((item) => item.id === id);
        return (
          <li key={index}>
            <button type="button" className="text-left" onClick={() => id && onOpen(id)}>
              <span className="block text-fg-2">{bill?.vendorName ?? 'Bill'}</span>
              <span>{notice.type === 'approval.requested' ? 'Target hit — approve' : notice.type}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
