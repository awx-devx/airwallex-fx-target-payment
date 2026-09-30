import { describe, expect, it } from 'vitest';
import { BILL_STATES } from '@/contracts/bill';
import { getCurrency } from '@/contracts/currencies';
import { D, formatDecimal } from '@/contracts/money';
import {
  buildIban,
  isValidAba,
  isValidIban,
  isValidIfsc,
  isValidLuhn,
} from '@/mocks/generators/bankDetails';
import { CORRIDORS } from '@/mocks/generators/corridors';
import { spansWeekend } from '@/mocks/generators/dates';
import { generateSnapshot } from '@/mocks/generators/snapshot';
import { VARIANTS } from '@/mocks/generators/invoices';

describe('bank checksums', () => {
  it('accepts known IBAN, ABA and Luhn vectors', () => {
    expect(isValidIban('DE89370400440532013000')).toBe(true);
    expect(buildIban('DE', '370400440532013000')).toBe(
      'DE89370400440532013000',
    );
    expect(isValidAba('021000021')).toBe(true);
    expect(isValidAba('021000022')).toBe(false);
    expect(isValidLuhn('79927398713')).toBe(true);
    expect(isValidIfsc('HDFC0001234')).toBe(true);
    expect(isValidIfsc('HDFC1001234')).toBe(false);
  });
});

describe('generateSnapshot', () => {
  it('repeats a snapshot for the same seed', () => {
    const first = generateSnapshot({ seed: 42, profile: 'mixed' });
    const second = generateSnapshot({ seed: 42, profile: 'mixed' });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(
      JSON.stringify(generateSnapshot({ seed: 43, profile: 'mixed' })),
    ).not.toBe(JSON.stringify(first));
  });

  it('keeps invoice totals exact and dates ordered', () => {
    const snapshot = generateSnapshot({ seed: 7, profile: 'extraction' });
    expect(snapshot.bills).toHaveLength(0);
    expect(snapshot.invoices.length).toBeGreaterThanOrEqual(30);
    for (const invoice of snapshot.invoices) {
      const precision = getCurrency(invoice.currency)?.payoutPrecision ?? 2;
      const lines = invoice.lineItems.reduce(
        (sum, line) => sum.plus(line.amount),
        D('0'),
      );
      expect(formatDecimal(lines, precision)).toBe(invoice.subtotal);
      for (const line of invoice.lineItems) {
        expect(formatDecimal(D(line.qty).mul(line.unitPrice), precision)).toBe(
          line.amount,
        );
      }
      expect(
        formatDecimal(D(invoice.subtotal).plus(invoice.tax), precision),
      ).toBe(invoice.total);
      expect(invoice.dueDate >= invoice.issueDate).toBe(true);
    }
  });

  it('builds checksum-valid bank details on enabled corridors', () => {
    const snapshot = generateSnapshot({ seed: 11, profile: 'corridors' });
    expect(snapshot.bills).toHaveLength(CORRIDORS.length);
    for (const bank of snapshot.banks) {
      const currency = getCurrency(bank.currency);
      expect(currency?.fx.buy).toBe(true);
      if (bank.iban) expect(isValidIban(bank.iban)).toBe(true);
      if (bank.ifsc) expect(isValidIfsc(bank.ifsc)).toBe(true);
      if (bank.routingNumber) expect(isValidAba(bank.routingNumber)).toBe(true);
      if (bank.accountNumber)
        expect(isValidLuhn(bank.accountNumber)).toBe(true);
    }
    for (const bill of snapshot.bills) {
      expect(bill.currency).not.toBe(snapshot.homeCurrency);
      expect(bill.amount).toBe(snapshot.invoices[bill.invoiceIndex]?.total);
    }
  });

  it('matches the mixed, lifecycle, deadline, stress, upload and e2e profiles', () => {
    const mixed = generateSnapshot({ seed: 1, profile: 'mixed' });
    const counts = new Map<string, number>();
    for (const bill of mixed.bills)
      counts.set(bill.state, (counts.get(bill.state) ?? 0) + 1);
    expect(counts.get('DRAFT')).toBe(2);
    expect(counts.get('READY')).toBe(2);
    expect(counts.get('WATCHING')).toBe(5);
    expect(counts.get('PAUSED')).toBe(1);
    expect(counts.get('DEADLINE_WINDOW')).toBe(1);
    expect(counts.get('PAID')).toBe(1);
    expect(
      mixed.bills.filter((bill) => bill.strategyMode === 'MAX_COST'),
    ).toHaveLength(1);
    expect(
      mixed.bills
        .filter((bill) => bill.state === 'WATCHING')
        .map((bill) => bill.targetDistanceBps)
        .sort((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual([10, 20, 30, 80, 300]);

    const lifecycle = generateSnapshot({ seed: 2, profile: 'lifecycle' });
    expect(lifecycle.bills.map((bill) => bill.state).sort()).toEqual(
      [...BILL_STATES].sort(),
    );

    const deadline = generateSnapshot({ seed: 3, profile: 'deadline' });
    expect(
      deadline.bills.some((bill) => spansWeekend(deadline.asOf, bill.dueDate)),
    ).toBe(true);

    const stress = generateSnapshot({ seed: 4, profile: 'stress' });
    expect(stress.bills).toHaveLength(200);
    expect(new Set(stress.bills.map((bill) => bill.currency)).size).toBe(20);
    expect(stress.bills.every((bill) => bill.state === 'WATCHING')).toBe(true);

    const upload = generateSnapshot({ seed: 5, profile: 'upload' });
    expect(upload.invoices).toHaveLength(5);
    expect(upload.bills).toHaveLength(0);
    expect(
      upload.invoices.some((invoice) => invoice.variant === 'scanned'),
    ).toBe(true);
    expect(
      upload.invoices.some(
        (invoice) => invoice.variant === 'missing-bank' && !invoice.bank,
      ),
    ).toBe(true);

    const e2e = generateSnapshot({ seed: 1, profile: 'e2e' });
    expect(e2e.bills.map((bill) => bill.state)).toEqual([
      'DRAFT',
      'READY',
      'WATCHING',
      'TARGET_HIT',
      'DEADLINE_WINDOW',
      'PAID',
    ]);

    const extraction = generateSnapshot({ seed: 9, profile: 'extraction' });
    expect(
      new Set(extraction.invoices.map((invoice) => invoice.variant)),
    ).toEqual(new Set(VARIANTS));
    expect(
      extraction.invoices.some(
        (invoice) =>
          invoice.variant === 'foreign-home' && invoice.currency === 'USD',
      ),
    ).toBe(true);
    expect(
      extraction.invoices.some(
        (invoice) => invoice.variant === 'conflicting-qr',
      ),
    ).toBe(true);
  });
});
