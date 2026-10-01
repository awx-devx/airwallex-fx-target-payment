import type { BillSummary } from '@/contracts/bill';
import { D, significantPrice } from '@/contracts/money';
import {
  approvalCatalog,
  balances,
  bills,
  events,
  executionCatalog,
} from '@/mocks/fixtures/catalog';
import { FIXTURE_NOW } from '@/mocks/fixtures/build';
import { fieldErrorsByCorridor, formSchemaFor, formSchemas } from '@/mocks/fixtures/forms';

export const PATTERN_NOW = FIXTURE_NOW;
export { approvalCatalog, balances, bills, events, executionCatalog, fieldErrorsByCorridor, formSchemaFor, formSchemas };

export function sparklineFor(price = '1.00000'): string[] {
  const end = D(price);
  return Array.from({ length: 8 }, (_, index) =>
    significantPrice(end.plus(D('0.0004').mul(String(7 - index)))),
  );
}

export interface BillRow {
  bill: BillSummary;
  sparkline: readonly string[];
}

export function billRows(): BillRow[] {
  return bills.map((bill) => ({
    bill,
    sparkline: sparklineFor(bill.lastPrice ?? bill.entryPrice ?? '1.00000'),
  }));
}

export function manyRows(count = 48): BillRow[] {
  const base = billRows();
  return Array.from({ length: count }, (_, index) => {
    const row = base[index % base.length];
    if (!row) return { bill: bills[0]!, sparkline: sparklineFor() };
    return { bill: { ...row.bill, id: `${row.bill.id}-${index}` }, sparkline: row.sparkline };
  });
}

export function billByState(state: BillSummary['state']): BillSummary {
  const found = bills.find((bill) => bill.state === state);
  if (!found) throw new Error(`missing ${state}`);
  return found;
}
