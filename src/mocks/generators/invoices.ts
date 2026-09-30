import { en, Faker } from '@faker-js/faker';
import { requireCurrency } from '@/contracts/currencies';
import { D, formatDecimal } from '@/contracts/money';
import type { BankDetails } from '@/mocks/generators/bankDetails';
import type { Corridor } from '@/mocks/generators/corridors';
import { addDays } from '@/mocks/generators/dates';
import type { Rng } from '@/mocks/generators/rng';
import type { Vendor } from '@/mocks/generators/vendors';

export const TEMPLATES = ['classic', 'modern', 'minimal', 'locale'] as const;
export type Template = (typeof TEMPLATES)[number];

export const VARIANTS = [
  'clean',
  'scanned',
  'multi-page',
  'ambiguous-dates',
  'multiple-amounts',
  'epc-qr',
  'conflicting-qr',
  'factur-x',
  'missing-bank',
  'duplicate',
  'foreign-home',
] as const;
export type Variant = (typeof VARIANTS)[number];

export interface InvoiceLine {
  description: string;
  qty: string;
  unitPrice: string;
  amount: string;
}

export interface InvoiceTruth {
  generatorVersion: 1;
  seed: number;
  index: number;
  template: Template;
  variant: Variant;
  vendor: { name: string; country: string; email: string };
  invoiceNumber: string;
  currency: string;
  subtotal: string;
  tax: string;
  total: string;
  issueDate: string;
  dueDate: string;
  displayIssueDate?: string;
  bank?: BankDetails;
  qrIban?: string;
  lineItems: InvoiceLine[];
  amountPaid?: string;
  balanceDue?: string;
}

export function generateInvoice(input: {
  rng: Rng;
  seed: number;
  index: number;
  template: Template;
  variant: Variant;
  vendor: Vendor;
  corridor: Corridor;
  bank?: BankDetails;
  asOf: string;
  dueDate: string;
  lineCount?: number;
}): InvoiceTruth {
  const faker = new Faker({ locale: [en] });
  faker.seed(input.seed * 10007 + input.index + 17);
  const precision = requireCurrency(input.corridor.currency).payoutPrecision;
  const count =
    input.lineCount ?? input.rng.int(1, input.variant === 'multi-page' ? 8 : 4);
  const lineItems: InvoiceLine[] = [];
  for (let i = 0; i < count; i += 1) {
    const qty = String(input.rng.int(1, 6));
    const unitPrice = input.rng.money(
      input.corridor.unitMin,
      input.corridor.unitMax,
      precision,
    );
    lineItems.push({
      description: faker.commerce.productName(),
      qty,
      unitPrice,
      amount: formatDecimal(D(qty).mul(unitPrice), precision),
    });
  }
  const subtotal = formatDecimal(
    lineItems.reduce((sum, line) => sum.plus(line.amount), D('0')),
    precision,
  );
  const tax = formatDecimal(D(subtotal).mul(input.corridor.taxRate), precision);
  const total = formatDecimal(D(subtotal).plus(tax), precision);
  const issueDate = addDays(input.asOf, -input.rng.int(5, 15));
  const invoice: InvoiceTruth = {
    generatorVersion: 1,
    seed: input.seed,
    index: input.index,
    template: input.template,
    variant: input.variant,
    vendor: {
      name: input.vendor.name,
      country: input.vendor.country,
      email: input.vendor.email,
    },
    invoiceNumber: `${input.corridor.country}-${input.seed}-${String(input.index).padStart(4, '0')}`,
    currency: input.corridor.currency,
    subtotal,
    tax,
    total,
    issueDate,
    dueDate: input.dueDate < issueDate ? addDays(issueDate, 7) : input.dueDate,
    bank: input.variant === 'missing-bank' ? undefined : input.bank,
    lineItems,
  };
  if (input.variant === 'ambiguous-dates') {
    const [year, month, day] = invoice.issueDate.split('-');
    invoice.displayIssueDate = `${day}/${month}/${year}`;
  }
  if (input.variant === 'multiple-amounts') {
    invoice.amountPaid = formatDecimal(D('0'), precision);
    invoice.balanceDue = total;
  }
  if (input.variant === 'epc-qr' && input.bank?.iban)
    invoice.qrIban = input.bank.iban;
  if (input.variant === 'conflicting-qr' && input.bank?.iban) {
    invoice.qrIban = input.bank.iban.startsWith('DE')
      ? 'DE44500105175407324931'
      : `${input.bank.iban.slice(0, -1)}${input.bank.iban.endsWith('0') ? '1' : '0'}`;
  }
  return invoice;
}
