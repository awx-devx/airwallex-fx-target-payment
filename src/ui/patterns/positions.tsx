'use client';

import type { BillEvent } from '@/contracts/events';
import type { BillSummary } from '@/contracts/bill';
import { D } from '@/contracts/money';
import { useState } from 'react';
import { motion } from 'motion/react';
import { Button } from '@/ui/primitives/button';
import { EmptyState } from '@/ui/primitives/empty-state';
import { Menu, MenuItem } from '@/ui/primitives/menu';
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

type SortKey = 'deadline' | 'amount' | 'distance';

export function PositionsTable({
  bills,
  selectedId,
  onSelect,
  loading = false,
}: {
  bills: readonly BillSummary[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  loading?: boolean;
}) {
  const [sort, setSort] = useState<SortKey>('deadline');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const rows = [...bills].sort((left, right) => {
    const flip = direction === 'asc' ? 1 : -1;
    if (sort === 'amount') return flip * D(left.amount).comparedTo(D(right.amount));
    if (sort === 'distance') return flip * ((left.distanceToTargetBps ?? 0) - (right.distanceToTargetBps ?? 0));
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
    <Table label="Positions">
      <thead>
        <tr>
          <Th>Pair</Th>
          <Th>Vendor</Th>
          <Th sortable sorted={sort === 'amount' ? direction : undefined} onSort={() => toggle('amount')}>
            Amount
          </Th>
          <Th>Entry</Th>
          <Th>Mark</Th>
          <Th>Target</Th>
          <Th sortable sorted={sort === 'distance' ? direction : undefined} onSort={() => toggle('distance')}>
            Distance
          </Th>
          <Th>Savings</Th>
          <Th>Est. cost</Th>
          <Th sortable sorted={sort === 'deadline' ? direction : undefined} onSort={() => toggle('deadline')}>
            Execute by
          </Th>
          <Th>State</Th>
          <Th>Actions</Th>
        </tr>
      </thead>
      {loading ? (
        <LoadingRows columns={12} />
      ) : (
        <tbody>
          {rows.map((bill) => (
            <PositionRow
              key={bill.id}
              bill={bill}
              selected={bill.id === selectedId}
              onSelect={() => onSelect?.(bill.id)}
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
}: {
  bill: BillSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const mark = bill.lastPrice ?? bill.entryPrice ?? '0';
  const tick = useTickFlash(mark);
  return (
    <tr
      className={
        selected
          ? 'relative border-b border-line-1 bg-orange-wash shadow-[inset_2px_0_0_var(--orange-500)]'
          : 'relative border-b border-line-1'
      }
      style={{ height: 'var(--row-h)' }}
      onClick={onSelect}
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
      <Td>{bill.distanceToTargetBps ?? '—'}</Td>
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
      <Td>
        <Menu trigger={<Button size="xs" variant="ghost">Actions</Button>}>
          {bill.allowedActions.slice(0, 4).map((action) => (
            <MenuItem key={action}>{action.replaceAll('_', ' ').toLowerCase()}</MenuItem>
          ))}
        </Menu>
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
  loading = false,
}: {
  bills: readonly BillSummary[];
  approvals: readonly BillSummary[];
  executed: readonly BillSummary[];
  events: readonly BillEvent[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  loading?: boolean;
}) {
  const [tab, setTab] = useState('positions');
  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      size="sm"
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
            <PositionsTable bills={bills} selectedId={selectedId} onSelect={onSelect} />
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
              <PositionsTable bills={approvals} selectedId={selectedId} onSelect={onSelect} />
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
              <PositionsTable bills={executed} selectedId={selectedId} onSelect={onSelect} />
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
              <div className="max-h-64 space-y-2 overflow-auto p-3">
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
