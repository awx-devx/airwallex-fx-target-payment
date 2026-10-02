import type { BillSummary } from '@/contracts/bill';
import { D } from '@/contracts/money';

export type BillFilter = 'all' | 'watching' | 'paid';
export type BillSort = 'deadline' | 'distance' | 'amount';

const FILTERS: Record<BillFilter, (bill: BillSummary) => boolean> = {
  all: () => true,
  watching: (bill) => bill.state === 'WATCHING' || bill.state === 'PAUSED',
  paid: (bill) => bill.state === 'PAID',
};

export function filterBills(bills: readonly BillSummary[], filter: BillFilter): BillSummary[] {
  return bills.filter(FILTERS[filter]);
}

export function sortBills(bills: readonly BillSummary[], sort: BillSort): BillSummary[] {
  const copy = [...bills];
  copy.sort((left, right) => {
    if (sort === 'deadline') return left.executionDeadline.localeCompare(right.executionDeadline);
    if (sort === 'amount') return D(right.amount).comparedTo(D(left.amount));
    return (left.distanceToTargetBps ?? 0) - (right.distanceToTargetBps ?? 0);
  });
  return copy;
}

export function pairKey(bill: BillSummary): string {
  return `${bill.pair.base}/${bill.pair.quote}`;
}

export function windowedRange(
  scrollTop: number,
  height: number,
  rowHeight: number,
  count: number,
  overscan = 2,
): { start: number; end: number } {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil((scrollTop + height) / rowHeight) + overscan);
  return { start, end };
}
