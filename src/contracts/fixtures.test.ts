import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_VERIFICATION_CODES,
  FAILURE_CATEGORIES,
  FUNDING_STATUSES,
  NAME_MATCHES,
  TRANSFER_STATUSES,
  accountVerificationSchema,
  beneficiaryFormSchemaSchema,
  executionSummarySchema,
} from '@/contracts/airwallex';
import { billSummarySchema } from '@/contracts/bill';
import { billEventSchema } from '@/contracts/events';
import { balanceSummarySchema } from '@/contracts/airwallex';
import { D, formatDecimal } from '@/contracts/money';
import {
  assertFixtureCoverage,
  balances,
  bills,
  events,
  executionCatalog,
  fieldErrorsByCorridor,
  formSchemas,
  verificationCatalog,
} from '@/mocks/fixtures';

describe('fixtures', () => {
  it('parses every bill, execution, event and form', () => {
    assertFixtureCoverage();
    for (const bill of bills) expect(billSummarySchema.parse(bill).id).toBe(bill.id);
    for (const item of executionCatalog) executionSummarySchema.parse(item);
    for (const event of events) billEventSchema.parse(event);
    for (const balance of balances) balanceSummarySchema.parse(balance);
    for (const schema of formSchemas) beneficiaryFormSchemaSchema.parse(schema);
    for (const verification of verificationCatalog) accountVerificationSchema.parse(verification);
    expect(Object.keys(fieldErrorsByCorridor).sort()).toEqual(['EUR', 'GBP', 'INR', 'USD']);
  });

  it('covers every Airwallex status the kit has to render', () => {
    expect(new Set(executionCatalog.map((item) => item.status))).toEqual(new Set(TRANSFER_STATUSES));
    expect(
      new Set(executionCatalog.flatMap((item) => (item.funding ? [item.funding.status] : []))),
    ).toEqual(new Set(FUNDING_STATUSES));
    expect(
      new Set(executionCatalog.flatMap((item) => (item.failure ? [item.failure.category] : []))),
    ).toEqual(new Set(FAILURE_CATEGORIES));
    expect(new Set(verificationCatalog.map((item) => item.code))).toEqual(
      new Set(ACCOUNT_VERIFICATION_CODES),
    );
    expect(
      new Set(verificationCatalog.flatMap((item) => (item.nameMatch ? [item.nameMatch] : []))),
    ).toEqual(new Set(NAME_MATCHES));
    expect(executionCatalog.some((item) => item.amountsTentative)).toBe(true);
    expect(executionCatalog.some((item) => !item.amountsTentative)).toBe(true);
    expect(executionCatalog.some((item) => item.lateFailureWatchUntil)).toBe(true);
    const kinds = new Set(formSchemas.flatMap((schema) => schema.fields.map((field) => field.type)));
    expect(kinds).toEqual(
      new Set(['INPUT', 'SELECT', 'DYNAMIC_SELECT', 'RADIO', 'TRANSFER_METHOD']),
    );
  });

  it('computes watching savings from decimal amounts', () => {
    const watching = bills.find((bill) => bill.id === 'bill-watching');
    expect(watching).toBeDefined();
    if (!watching?.entryPrice || !watching.lastPrice) throw new Error('watching bill has no prices');
    expect(watching.savings).toBe(
      formatDecimal(D(watching.amount).mul(D(watching.entryPrice).minus(watching.lastPrice)), 2),
    );
  });
});
