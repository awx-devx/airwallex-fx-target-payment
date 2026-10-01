'use client';

import type { BillEvent } from '@/contracts/events';
import type { BillAction, BillSummary } from '@/contracts/bill';
import { D } from '@/contracts/money';
import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'motion/react';
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
  APPROVE: 'Approve',
  HOLD: 'Hold',
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
  return (
    <Table label="Positions" scroll={!stickyHeader}>
      <thead>
        <tr>
          <Th sticky={stickyHeader}>
            <span className="sr-only">Actions</span>
          </Th>
          <Th sticky={stickyHeader}>Pair</Th>
          <Th sticky={stickyHeader}>Vendor</Th>
          <Th sticky={stickyHeader} sortable sorted={sort === 'amount' ? direction : undefined} onSort={() => toggle('amount')}>
            Amount
          </Th>
          <Th sticky={stickyHeader}>Entry</Th>
          <Th sticky={stickyHeader}>Mark</Th>
          <Th sticky={stickyHeader}>Target</Th>
          <Th sticky={stickyHeader}>Savings</Th>
          <Th sticky={stickyHeader}>Est. cost</Th>
          <Th sticky={stickyHeader} sortable sorted={sort === 'deadline' ? direction : undefined} onSort={() => toggle('deadline')}>
            Execute by
          </Th>
          <Th sticky={stickyHeader}>State</Th>
        </tr>
      </thead>
      {loading ? (
        <LoadingRows columns={11} />
      ) : (
        <tbody>
          {rows.map((bill) => (
            <PositionRow
              key={bill.id}
              bill={bill}
              selected={bill.id === selectedId}
              onSelect={() => onSelect?.(bill.id)}
              onAction={onAction}
              onOpenTicket={onOpenTicket}
            />
          ))}
        </tbody>
      )}
    </Table>
  );
}

function PositionRow({
  bill,
  selected,
  onSelect,
  onAction,
  onOpenTicket,
}: {
  bill: BillSummary;
  selected: boolean;
  onSelect: () => void;
  onAction?: (bill: BillSummary, action: BillAction) => void;
  onOpenTicket?: (bill: BillSummary) => void;
}) {
  const mark = bill.lastPrice ?? bill.entryPrice ?? '0';
  const tick = useTickFlash(mark);
  return (
    <tr
      className={
        selected
          ? 'relative cursor-pointer border-b border-line-1 bg-orange-wash shadow-[inset_2px_0_0_var(--orange-500)] hover:bg-orange-500/15'
          : 'relative cursor-pointer border-b border-line-1 hover:bg-white/6'
      }
      style={{ height: 'var(--row-h)' }}
      onClick={onSelect}
    >
      <td className="px-3" onClick={(event) => event.stopPropagation()}>
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
      </td>
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
}

export function PositionsPanel({
  bills,
  approvals,
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
  approvals: readonly BillSummary[];
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
          value: 'approvals',
          label: 'Approvals',
          count: approvals.length,
          content:
            approvals.length === 0 ? (
              <EmptyState title="No approvals waiting" />
            ) : (
              <PositionsTable bills={approvals} selectedId={selectedId} onSelect={onSelect} onAction={onAction} onOpenTicket={onOpenTicket} stickyHeader={fill} />
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
