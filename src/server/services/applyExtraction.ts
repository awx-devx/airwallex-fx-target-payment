import { extractedBillSchema, type ExtractedBill } from '@/contracts/extraction';
import type { Clock } from '@/server/adapters/clock';
import { fromDecimal128, toDecimal128 } from '@/server/db/decimal';
import { Bill, BillDocument } from '@/server/db/models';
import { D, decimalString } from '@/contracts/money';
import { isCurrencyCode } from '@/contracts/currencies';
import {
  accountDate,
  defaultLeadDays,
  executionSchedule,
  utcDateOnly,
} from '@/server/domain/deadline';
import type { Env } from '@/server/env';
import { validateExtraction } from '@/server/adapters/extraction/validators';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Copy a finished extraction onto a draft bill. A bill that has left DRAFT is left alone. */
export async function applyExtractedBill(
  billId: string,
  extracted: ExtractedBill,
  env: Env,
  clock: Clock,
): Promise<ExtractedBill> {
  const today = accountDate(clock.now(), env.AIRWALLEX_ACCOUNT_TZ);
  const duplicate = await duplicates(billId, extracted);
  const result = validateExtraction(extracted, {
    homeCurrency: env.HOME_CURRENCY,
    today,
    duplicate,
  });
  const current = await Bill.findById(billId);
  if (!current || current.state !== 'DRAFT') return result;
  const patch = draftPatch(current, result, env);
  await Bill.findOneAndUpdate(
    { _id: current._id, state: 'DRAFT', version: current.version },
    { $set: patch, $inc: { version: 1 } },
    { returnDocument: 'after' },
  );
  return result;
}

export async function saveExtraction(
  documentId: string,
  result: ExtractedBill | undefined,
  error?: string,
): Promise<void> {
  await BillDocument.findByIdAndUpdate(documentId, {
    $set: {
      extraction: {
        status: result ? 'DONE' : 'FAILED',
        ...(result ? { result: extractedBillSchema.parse(result) } : {}),
        ...(error ? { error } : {}),
      },
    },
  });
}

async function duplicates(billId: string, extracted: ExtractedBill): Promise<boolean> {
  const vendor = extracted.vendorName.value;
  const invoice = extracted.invoiceNumber.value;
  const amount = extracted.amountDue.value;
  if (!vendor || !invoice || !amount) return false;
  const others = await Bill.find({
    _id: { $ne: billId },
    vendorName: vendor,
    invoiceNumber: invoice,
    state: { $ne: 'CANCELLED' },
  }).lean();
  return others.some((bill) => {
    try {
      return D(decimalString(fromDecimal128(bill.billAmount))).eq(amount);
    } catch {
      return false;
    }
  });
}

function draftPatch(
  current: {
    transferMethod: 'LOCAL' | 'SWIFT';
    leadDays: number;
    strategy?: { autosettleCutoff?: string } | null;
  },
  result: ExtractedBill,
  env: Env,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const vendor = result.vendorName.value;
  const invoice = result.invoiceNumber.value;
  const currency = result.currency.value?.toUpperCase();
  const amount = result.amountDue.value;
  const due = result.dueDate.value;
  const issued = result.issueDate.value;
  if (vendor) patch.vendorName = vendor;
  if (invoice) {
    patch.invoiceNumber = invoice;
    patch.reference = result.paymentReference?.value || invoice;
  }
  if (currency && isCurrencyCode(currency) && currency !== env.HOME_CURRENCY) patch.billCurrency = currency;
  if (amount && D(amount).gt(0)) patch.billAmount = toDecimal128(amount);
  if (issued && ISO_DATE.test(issued)) patch.issuedDate = utcDateOnly(issued);
  if (due && ISO_DATE.test(due)) {
    const leadDays = current.leadDays || defaultLeadDays(current.transferMethod);
    const schedule = executionSchedule({
      dueDate: due,
      leadDays,
      cutoff: current.strategy?.autosettleCutoff ?? env.DEADLINE_AUTOSETTLE_CUTOFF,
      timeZone: env.AIRWALLEX_ACCOUNT_TZ,
    });
    patch.dueDate = utcDateOnly(due);
    patch.executionDeadline = utcDateOnly(schedule.executionDeadline);
  }
  return patch;
}
