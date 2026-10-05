'use client';

import type { BillEvent } from '@/contracts/events';
import type { BillAction, BillSummary } from '@/contracts/bill';
import { D } from '@/contracts/money';
import { MoreHorizontal } from 'lucide-react';
import { memo, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { cx } from '@/ui/primitives/cx';
import { EmptyState } from '@/ui/primitives/empty-state';
import { IconButton } from '@/ui/primitives/icon-button';
import { Menu, MenuItem, MenuSeparator } from '@/ui/primitives/menu';
import { Tabs } from '@/ui/primitives/tabs';
import { LoadingRows, Table, Td, Th } from '@/ui/primitives/table';
import { useTickFlash } from '@/ui/motion/hooks';
import { ActivityItem } from '@/ui/trading/activity-item';
import { MoneyDisplay } from '@/ui/trading/money-display';
import { PairLabel } from '@/ui/trading/pair-label';
import { PriceDisplay } from '@/ui/trading/price-display';
import { SavingsCell } from '@/ui/trading/savings-cell';
import { StateBadge } from '@/ui/trading/state-badge';
import { formatUtcDate } from '@/ui/trading/time-label';

type SortKey = 'deadline' | 'amount';

const ACTION_LABEL: Record<BillAction, string> = {
  REVIEW: 'Review bill',
  EDIT: 'Edit',
  RESOLVE_BENEFICIARY: 'Resolve beneficiary',
  ARM: 'Arm',
  EDIT_STRATEGY: 'Edit strategy',
  PAUSE: 'Pause',
  RESUME: 'Resume',
  PAY_NOW: 'Pay now',
  CANCEL: 'Cancel',
  REARM: 'Re-arm',
  ADVANCE_TRANSFER: 'Advance status',
  SIMULATE: 'Simulate target hit',
  STOP_SIMULATION: 'Stop simulation',
};

export function PositionsTable({
  bills,
  selectedId,
  onSelect,
  onAction,
  onOpenTicket,
  loading = false,
  stickyHeader = false,
}: {
  bills: readonly BillSummary[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onAction?: (bill: BillSummary, action: BillAction) => void;
  onOpenTicket?: (bill: BillSummary) => void;
  loading?: boolean;
  stickyHeader?: boolean;
}) {
  const [sort, setSort] = useState<SortKey>('deadline');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const rows = [...bills].sort((left, right) => {
    const flip = direction === 'asc' ? 1 : -1;
    if (sort === 'amount') return flip * D(left.amount).comparedTo(D(right.amount));
    return flip * left.executionDeadline.localeCompare(right.executionDeadline);
  });
  function toggle(next: SortKey) {
    if (sort === next) setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(next);
      setDirection('asc');
    }
  }
  const [hovered, setHovered] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerTrackRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const headerCellRef = useRef<HTMLDivElement>(null);
  const rowKey = rows.map((row) => row.id).join('\n');
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const header = headerTrackRef.current;
    const rail = railRef.current;
    const headerCell = headerCellRef.current;
    if (!body || !header || !rail || !headerCell) return;
    const sync = () => {
      const table = body.querySelector('table');
      const headerTable = header.querySelector('table');
      const sample = body.querySelector('tbody tr');
      if (!table || !headerTable || !sample) return;
      headerTable.style.width = 'auto';
      headerTable.style.tableLayout = 'auto';
      headerTable.querySelector('colgroup')?.remove();
      const headerCells = [...headerTable.querySelectorAll('th')] as HTMLElement[];
      headerCells.forEach((cell, index) => {
        const item = sample.children[index] as HTMLElement | undefined;
        if (!item) return;
        const min = `${Math.ceil(cell.scrollWidth)}px`;
        if (item.style.minWidth !== min) item.style.minWidth = min;
      });
      const widths = [...sample.children].map((cell) => cell.getBoundingClientRect().width);
      applyColumns(headerTable, widths);
      headerTable.style.width = `${table.scrollWidth}px`;
      const thead = header.querySelector('thead');
      if (thead) headerCell.style.height = `${thead.getBoundingClientRect().height}px`;
      const bodyRows = body.querySelectorAll('tbody tr');
      [...rail.children].forEach((cell, index) => {
        const row = bodyRows[index];
        if (row && cell instanceof HTMLElement) cell.style.height = `${row.getBoundingClientRect().height}px`;
      });
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(body);
    body.querySelectorAll('tbody tr').forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [rowKey, loading, sort, direction]);
  const columns = (
    <>
      <Th>Pair</Th>
      <Th>Vendor</Th>
      <Th sortable sorted={sort === 'amount' ? direction : undefined} onSort={() => toggle('amount')}>
        Amount
      </Th>
      <Th>Entry</Th>
      <Th>Mark</Th>
      <Th>Target</Th>
      <Th>Savings</Th>
      <Th>Est. cost</Th>
      <Th sortable sorted={sort === 'deadline' ? direction : undefined} onSort={() => toggle('deadline')}>
        Execute by
      </Th>
      <Th>State</Th>
    </>
  );
  const body = loading ? (
    <LoadingRows columns={10} />
  ) : (
    <tbody>
      {rows.map((bill) => (
        <PositionRow
          key={bill.id}
          bill={bill}
          selected={bill.id === selectedId}
          hovered={hovered === bill.id}
          onHover={(active) => setHovered(active ? bill.id : null)}
          onSelect={() => onSelect?.(bill.id)}
        />
      ))}
    </tbody>
  );
  const menuCells = rows.map((bill) => (
    <div
      key={bill.id}
      className={cx(
        'flex items-center justify-center border-b border-line-1',
        rowTone(bill.id === selectedId, hovered === bill.id),
        bill.id === selectedId && 'shadow-[inset_2px_0_0_var(--orange-500)]',
      )}
      style={{ height: 'var(--row-h)' }}
      onMouseEnter={() => setHovered(bill.id)}
      onMouseLeave={() => setHovered(null)}
    >
      <RowMenu bill={bill} onAction={onAction} onOpenTicket={onOpenTicket} />
    </div>
  ));
  // The menu shares the vertical scroll with the rows. Sideways scrolling is only
  // the table, so the row text clips at the menu instead of sliding under it.
  return (
    <div className={cx('min-w-0', stickyHeader && 'h-full overflow-x-hidden overflow-y-auto')}>
      <div className={cx('flex bg-bg-2', stickyHeader && 'sticky top-0 z-20')}>
        <div ref={headerCellRef} className="flex w-12 shrink-0 items-center border-b border-line-1" style={{ height: 'var(--row-h)' }}>
          <span className="sr-only">Actions</span>
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div ref={headerTrackRef} className="w-max">
            <table className="border-separate border-spacing-0 whitespace-nowrap text-left">
              <thead>
                <tr>{columns}</tr>
              </thead>
            </table>
          </div>
        </div>
      </div>
      <div className="flex items-start">
        <div
          ref={railRef}
          className="w-12 shrink-0"
          onWheel={(event) => {
            const scroller = bodyRef.current;
            if (!scroller || event.deltaX === 0) return;
            const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientWidth : 1;
            scroller.scrollLeft += event.deltaX * scale;
          }}
        >
          {menuCells}
        </div>
        <div className="min-w-0 flex-1 self-start">
          <div
            ref={bodyRef}
            className="overflow-x-auto"
            onScroll={(event) => {
              const track = headerTrackRef.current;
              if (track) track.style.transform = `translate3d(${-event.currentTarget.scrollLeft}px,0,0)`;
            }}
          >
            <Table label="Positions" scroll={false} className="whitespace-nowrap [&_td]:border-b [&_td]:border-line-1">
              {body}
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

function applyColumns(table: HTMLTableElement, widths: number[]) {
  const total = widths.reduce((sum, width) => sum + width, 0);
  table.style.tableLayout = 'fixed';
  table.style.width = `${total}px`;
  let group = table.querySelector('colgroup');
  if (!group) {
    group = document.createElement('colgroup');
    table.prepend(group);
  }
  while (group.children.length < widths.length) group.appendChild(document.createElement('col'));
  while (group.children.length > widths.length) group.lastElementChild?.remove();
  widths.forEach((width, index) => {
    const col = group.children[index] as HTMLElement;
    col.style.width = `${width}px`;
  });
}

function rowTone(selected: boolean, hovered: boolean) {
  if (selected) return hovered ? 'bg-orange-500/15' : 'bg-orange-wash';
  return hovered ? 'bg-white/6' : undefined;
}

function RowMenu({
  bill,
  onAction,
  onOpenTicket,
}: {
  bill: BillSummary;
  onAction?: (bill: BillSummary, action: BillAction) => void;
  onOpenTicket?: (bill: BillSummary) => void;
}) {
  return (
    <Menu
      trigger={
        <IconButton label="Actions" size="xs" variant="ghost">
          <MoreHorizontal strokeWidth={1.5} className="size-3.5" />
        </IconButton>
      }
    >
      <MenuItem onSelect={() => onOpenTicket?.(bill)}>Open ticket</MenuItem>
      {bill.allowedActions.some((action) => action !== 'CANCEL') ? <MenuSeparator /> : null}
      {bill.allowedActions
        .filter((action) => action !== 'CANCEL')
        .map((action) => (
          <MenuItem key={action} onSelect={() => onAction?.(bill, action)}>
            {ACTION_LABEL[action]}
          </MenuItem>
        ))}
      {bill.allowedActions.includes('CANCEL') ? (
        <>
          <MenuSeparator />
          <MenuItem destructive onSelect={() => onAction?.(bill, 'CANCEL')}>
            {ACTION_LABEL.CANCEL}
          </MenuItem>
        </>
      ) : null}
    </Menu>
  );
}

const PositionRow = memo(function PositionRow({
  bill,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  bill: BillSummary;
  selected: boolean;
  hovered: boolean;
  onHover: (active: boolean) => void;
  onSelect: () => void;
}) {
  const mark = bill.lastPrice ?? bill.entryPrice ?? '0';
  const tick = useTickFlash(mark);
  return (
    <tr
      className={cx('relative cursor-pointer border-b border-line-1', rowTone(selected, hovered))}
      style={{ height: 'var(--row-h)' }}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <td className="relative px-3">
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: tick.backgroundColor, opacity: tick.opacity }}
        />
        <span className="relative">
          <PairLabel pair={bill.pair} size="sm" />
        </span>
      </td>
      <Td>{bill.vendorName}</Td>
      <Td>
        <MoneyDisplay currency={bill.pair.base} value={bill.amount} size="sm" />
      </Td>
      <Td>{bill.entryPrice ? <PriceDisplay pair={bill.pair} value={bill.entryPrice} size="inline" /> : '—'}</Td>
      <Td>
        <PriceDisplay pair={bill.pair} value={mark} size="inline" flash />
      </Td>
      <Td>{bill.targetPrice ? <PriceDisplay pair={bill.pair} value={bill.targetPrice} size="inline" /> : '—'}</Td>
      <Td>
        {bill.savings ? (
          <SavingsCell currency={bill.pair.quote} savings={bill.savings} savingsPct={bill.savingsPct} />
        ) : (
          '—'
        )}
      </Td>
      <Td>
        {bill.estCost ? <MoneyDisplay currency={bill.pair.quote} value={bill.estCost} size="sm" /> : '—'}
      </Td>
      <Td>{formatUtcDate(bill.executionDeadline, 'day')}</Td>
      <Td>
        <StateBadge state={bill.state} />
      </Td>
    </tr>
  );
});

export function PositionsPanel({
  bills,
  executed,
  events,
  selectedId,
  onSelect,
  onAction,
  onOpenTicket,
  loading = false,
  fill = false,
}: {
  bills: readonly BillSummary[];
  executed: readonly BillSummary[];
  events: readonly BillEvent[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onAction?: (bill: BillSummary, action: BillAction) => void;
  onOpenTicket?: (bill: BillSummary) => void;
  loading?: boolean;
  /** Desktop terminal: the panel keeps one height so the chart above it does not jump. */
  fill?: boolean;
}) {
  const [tab, setTab] = useState('positions');
  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      size="sm"
      fill={fill}
      listClassName="px-4"
      tabs={[
        {
          value: 'positions',
          label: 'Positions',
          count: bills.length,
          content: loading ? (
            <Table label="Positions">
              <LoadingRows columns={6} />
            </Table>
          ) : bills.length === 0 ? (
            <EmptyState title="No open positions" />
          ) : (
            <PositionsTable bills={bills} selectedId={selectedId} onSelect={onSelect} onAction={onAction} onOpenTicket={onOpenTicket} stickyHeader={fill} />
          ),
        },
        {
          value: 'executed',
          label: 'Executed',
          count: executed.length,
          content:
            executed.length === 0 ? (
              <EmptyState title="Nothing executed yet" />
            ) : (
              <PositionsTable bills={executed} selectedId={selectedId} onSelect={onSelect} onAction={onAction} onOpenTicket={onOpenTicket} stickyHeader={fill} />
            ),
        },
        {
          value: 'activity',
          label: 'Activity',
          count: events.length,
          content:
            events.length === 0 ? (
              <EmptyState title="No activity" />
            ) : (
              <div className={fill ? 'space-y-2 p-3' : 'max-h-64 space-y-2 overflow-auto p-3'}>
                {events.map((event) => (
                  <ActivityItem key={event.id} event={event} />
                ))}
              </div>
            ),
        },
      ]}
    />
  );
}
