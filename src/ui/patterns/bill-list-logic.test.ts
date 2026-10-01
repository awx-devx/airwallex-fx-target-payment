import { describe, expect, it } from 'vitest';
import type { BillSummary } from '@/contracts/bill';
import { filterBills, sortBills, windowedRange } from '@/ui/patterns/bill-list-logic';

function bill(patch: Partial<BillSummary> & Pick<BillSummary, 'id' | 'state'>): BillSummary {
  return {
    vendorName: 'Vendor',
    invoiceNumber: 'INV',
    pair: { base: 'EUR', quote: 'USD' },
    amount: '100.00',
    dueDate: '2026-10-20',
    executionDeadline: '2026-10-16',
    transferMethod: 'LOCAL',
    transferReason: 'goods_purchased',
    reference: 'ref',
    flags: {},
    allowedActions: [],
    ...patch,
  };
}

describe('bill list logic', () => {
  const bills = [
    bill({ id: 'a', state: 'WATCHING', amount: '10.00', executionDeadline: '2026-10-20', distanceToTargetBps: 40 }),
    bill({ id: 'b', state: 'PAID', amount: '50.00', executionDeadline: '2026-10-12', distanceToTargetBps: 5 }),
    bill({ id: 'c', state: 'DEADLINE_WINDOW', amount: '30.00', executionDeadline: '2026-10-09', distanceToTargetBps: 12 }),
    bill({ id: 'd', state: 'TARGET_HIT', amount: '80.00', executionDeadline: '2026-10-18', distanceToTargetBps: 0 }),
  ];

  it('filters watching, approval, final day, and paid', () => {
    expect(filterBills(bills, 'watching').map((item) => item.id)).toEqual(['a']);
    expect(filterBills(bills, 'approval').map((item) => item.id)).toEqual(['d']);
    expect(filterBills(bills, 'final-day').map((item) => item.id)).toEqual(['c']);
    expect(filterBills(bills, 'paid').map((item) => item.id)).toEqual(['b']);
  });

  it('sorts by deadline, distance, and amount', () => {
    expect(sortBills(bills, 'deadline').map((item) => item.id)).toEqual(['c', 'b', 'd', 'a']);
    expect(sortBills(bills, 'distance').map((item) => item.id)).toEqual(['d', 'b', 'c', 'a']);
    expect(sortBills(bills, 'amount').map((item) => item.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('windows a long list to the visible rows', () => {
    expect(windowedRange(0, 200, 40, 100)).toEqual({ start: 0, end: 7 });
    expect(windowedRange(400, 200, 40, 100)).toEqual({ start: 8, end: 17 });
  });
});
