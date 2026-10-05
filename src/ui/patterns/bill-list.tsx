'use client';

import type { BillSummary } from '@/contracts/bill';
import { D, decimalString } from '@/contracts/money';
import { formatMoney } from '@/ui/format';
import { memo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { dur2, easeOut } from '@/ui/tokens/motion';
import { Button } from '@/ui/primitives/button';
import { Chip } from '@/ui/primitives/chip';
import { cx } from '@/ui/primitives/cx';
import { EmptyState } from '@/ui/primitives/empty-state';
import { Flag } from '@/ui/primitives/flag';
import { Input } from '@/ui/primitives/input';
import { SegmentedControl } from '@/ui/primitives/segmented';
import { Skeleton } from '@/ui/primitives/skeleton';
import { CountdownChip } from '@/ui/trading/countdown-chip';
import { DistanceToTarget } from '@/ui/trading/distance-to-target';
import { MoneyDisplay } from '@/ui/trading/money-display';
import { PairLabel } from '@/ui/trading/pair-label';
import { PriceDisplay } from '@/ui/trading/price-display';
import { PriceTicker } from '@/ui/trading/price-ticker';
import { Sparkline } from '@/ui/trading/sparkline';
import { StateBadge } from '@/ui/trading/state-badge';
import {
  filterBills,
  pairKey,
  sortBills,
  windowedRange,
  type BillFilter,
  type BillSort,
} from '@/ui/patterns/bill-list-logic';

export interface BillRow {
  bill: BillSummary;
  sparkline: readonly string[];
}

const FILTERS: { value: BillFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'watching', label: 'Watching' },
  { value: 'paid', label: 'Paid' },
];

export const BillListItem = memo(function BillListItem({
  bill,
  sparkline,
  now,
  selected = false,
  density = 'comfortable',
  layout = 'row',
  onSelect,
}: {
  bill: BillSummary;
  sparkline: readonly string[];
  now: string;
  selected?: boolean;
  density?: 'compact' | 'comfortable';
  layout?: 'row' | 'rail';
  onSelect?: (id: string) => void;
}) {
  const compact = density === 'compact';
  if (layout === 'rail') {
    return (
      <button
        type="button"
        onClick={() => onSelect?.(bill.id)}
        className={cx(
          'flex w-full flex-col gap-1 overflow-hidden border-b border-line-1 px-3 py-2.5 text-left outline-none',
          'focus-visible:shadow-[inset_0_0_0_1px_var(--line-3)]',
          selected
            ? 'bg-orange-wash shadow-[inset_2px_0_0_var(--orange-500)] hover:bg-orange-500/15'
            : 'hover:bg-white/6',
        )}
      >
        <span className="flex items-center gap-2">
          <span className="inline-flex shrink-0">
            <Flag currency={bill.pair.base} size={16} />
            <Flag currency={bill.pair.quote} size={16} />
          </span>
          <span className="min-w-0 flex-1 truncate font-medium text-fg-1">{bill.vendorName}</span>
          <StateBadge state={bill.state} />
        </span>
        <span className="flex items-baseline justify-between gap-3">
          <MoneyDisplay
            currency={bill.pair.base}
            value={bill.amount}
            size="sm"
            className="text-fg-3"
          />
          {bill.lastPrice ? (
            <PriceDisplay pair={bill.pair} value={bill.lastPrice} flash stale={bill.flags.stale} />
          ) : null}
        </span>
        <span className="flex items-center justify-between gap-3">
          {bill.lastPrice && bill.targetPrice ? (
            <span className="min-w-0 flex-1">
              <DistanceToTarget
                pair={bill.pair}
                price={bill.lastPrice}
                target={bill.targetPrice}
                compact
              />
            </span>
          ) : (
            <span />
          )}
          <CountdownChip until={`${bill.executionDeadline}T21:00:00.000Z`} now={now} kind="deadline" />
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect?.(bill.id)}
      className={cx(
        'flex w-full items-center gap-3 border-b border-line-1 px-3 text-left outline-none',
        'focus-visible:shadow-[inset_0_0_0_1px_var(--line-3)]',
        selected
          ? 'bg-orange-wash shadow-[inset_2px_0_0_var(--orange-500)] hover:bg-orange-500/15'
          : 'hover:bg-white/6',
      )}
      style={{ minHeight: compact ? 44 : 64 }}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <PairLabel pair={bill.pair} size="sm" />
          <span className="truncate text-fg-2">{bill.vendorName}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <MoneyDisplay currency={bill.pair.base} value={bill.amount} size="sm" />
          {bill.lastPrice ? (
            <PriceTicker
              pair={bill.pair}
              price={bill.lastPrice}
              entry={bill.entryPrice}
              size="compact"
              stale={bill.flags.stale}
            />
          ) : null}
        </span>
      </span>
      {compact ? null : <Sparkline points={sparkline} target={bill.targetPrice} />}
      {bill.lastPrice && bill.targetPrice ? (
        <span className={compact ? 'hidden' : 'w-28'}>
          <DistanceToTarget pair={bill.pair} price={bill.lastPrice} target={bill.targetPrice} />
        </span>
      ) : null}
      <CountdownChip until={`${bill.executionDeadline}T21:00:00.000Z`} now={now} kind="deadline" />
      <StateBadge state={bill.state} />
    </button>
  );
});

function EnterRow({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: dur2, ease: easeOut }}
    >
      {children}
    </motion.div>
  );
}

export function PairGroupHeader({
  pair,
  bills,
}: {
  pair: BillSummary['pair'];
  bills: readonly BillSummary[];
}) {
  const foreign = bills.reduce((sum, bill) => sum.plus(D(bill.amount)), D('0'));
  const home = bills.reduce((sum, bill) => {
    if (!bill.lastPrice) return sum;
    return sum.plus(D(bill.amount).mul(D(bill.lastPrice)));
  }, D('0'));
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-1 bg-bg-1 px-3 py-2">
      <PairLabel pair={pair} size="sm" />
      <p className="num text-xs text-fg-2">
        {formatMoney(pair.base, decimalString(foreign))}
        {home.greaterThan('0') ? ` · ${formatMoney(pair.quote, decimalString(home))}` : ''} · {bills.length}
      </p>
    </div>
  );
}

export function BillList({
  rows,
  now,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  grouped = false,
  onGroupedChange,
  query = '',
  onQueryChange,
  loading = false,
  density = 'comfortable',
  layout = 'row',
  onUpload,
  virtualized = false,
}: {
  rows: readonly BillRow[];
  now: string;
  selectedId?: string;
  onSelect?: (id: string) => void;
  filter: BillFilter;
  onFilterChange: (filter: BillFilter) => void;
  sort: BillSort;
  onSortChange: (sort: BillSort) => void;
  grouped?: boolean;
  onGroupedChange?: (grouped: boolean) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  density?: 'compact' | 'comfortable';
  layout?: 'row' | 'rail';
  onUpload?: () => void;
  virtualized?: boolean;
}) {
  const needle = query.trim().toLowerCase();
  const matched = rows.filter((row) => {
    if (!needle) return true;
    return (
      row.bill.vendorName.toLowerCase().includes(needle) ||
      row.bill.invoiceNumber.toLowerCase().includes(needle)
    );
  });
  const visible = sortBills(
    filterBills(
      matched.map((row) => row.bill),
      filter,
    ),
    sort,
  )
    .map((bill) => matched.find((row) => row.bill.id === bill.id))
    .filter((row): row is BillRow => Boolean(row));

  return (
    <section className="flex h-full min-h-80 flex-col">
      <div className="space-y-2 border-b border-line-1 p-3">
        <Input
          size="sm"
          aria-label="Search bills"
          placeholder="Search vendor or invoice"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
        />
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((item) => (
            <Chip
              key={item.value}
              selected={filter === item.value}
              onClick={() => onFilterChange(item.value)}
            >
              {item.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Sort bills"
            size="sm"
            value={sort}
            onValueChange={onSortChange}
            options={[
              { value: 'deadline', label: 'Deadline' },
              { value: 'distance', label: 'Distance' },
              { value: 'amount', label: 'Amount' },
            ]}
          />
          <Chip selected={grouped} onClick={() => onGroupedChange?.(!grouped)}>
            Group by pair
          </Chip>
          <Button size="sm" className="ml-auto" onClick={onUpload}>
            Upload bills
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="space-y-2 p-3">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState title="No bills" body="Nothing matches this filter." />
      ) : grouped ? (
        <Grouped
          rows={visible}
          now={now}
          selectedId={selectedId}
          density={density}
          layout={layout}
          onSelect={onSelect}
        />
      ) : virtualized ? (
        <VirtualRows
          rows={visible}
          now={now}
          selectedId={selectedId}
          density={density}
          layout={layout}
          onSelect={onSelect}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <AnimatePresence initial={false}>
            {visible.map((row) => (
              <EnterRow key={row.bill.id}>
                <BillListItem
                  bill={row.bill}
                  sparkline={row.sparkline}
                  now={now}
                  selected={row.bill.id === selectedId}
                  density={density}
                  layout={layout}
                  onSelect={onSelect}
                />
              </EnterRow>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

function Grouped({
  rows,
  now,
  selectedId,
  density,
  layout,
  onSelect,
}: {
  rows: readonly BillRow[];
  now: string;
  selectedId?: string;
  density: 'compact' | 'comfortable';
  layout: 'row' | 'rail';
  onSelect?: (id: string) => void;
}) {
  const groups = new Map<string, BillRow[]>();
  for (const row of rows) {
    const key = pairKey(row.bill);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {[...groups.entries()].map(([key, list]) => (
        <div key={key}>
          <PairGroupHeader pair={list[0]!.bill.pair} bills={list.map((row) => row.bill)} />
          <AnimatePresence initial={false}>
            {list.map((row) => (
              <EnterRow key={row.bill.id}>
                <BillListItem
                  bill={row.bill}
                  sparkline={row.sparkline}
                  now={now}
                  selected={row.bill.id === selectedId}
                  density={density}
                  layout={layout}
                  onSelect={onSelect}
                />
              </EnterRow>
            ))}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

function VirtualRows({
  rows,
  now,
  selectedId,
  density,
  layout,
  onSelect,
}: {
  rows: readonly BillRow[];
  now: string;
  selectedId?: string;
  density: 'compact' | 'comfortable';
  layout: 'row' | 'rail';
  onSelect?: (id: string) => void;
}) {
  const rowHeight = density === 'compact' ? 44 : 64;
  const height = 360;
  const [scrollTop, setScrollTop] = useState(0);
  const { start, end } = windowedRange(scrollTop, height, rowHeight, rows.length);
  const slice = rows.slice(start, end);
  return (
    <div
      className="overflow-auto"
      style={{ height }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div className="relative" style={{ height: rows.length * rowHeight }}>
        {slice.map((row, index) => (
          <div
            key={row.bill.id}
            className="absolute right-0 left-0"
            style={{ top: (start + index) * rowHeight }}
          >
            <BillListItem
              bill={row.bill}
              sparkline={row.sparkline}
              now={now}
              selected={row.bill.id === selectedId}
              density={density}
              layout={layout}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
