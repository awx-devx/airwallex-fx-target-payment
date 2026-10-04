import type { BeneficiarySummary, TransferMethod, TransferReason } from '@/contracts/airwallex';
import { billDetailSchema, type BillDetail, type StrategyDetail } from '@/contracts/api';
import { billSummarySchema, type BillState, type BillSummary } from '@/contracts/bill';
import type { BillEvent } from '@/contracts/events';
import type { RateSourceKind } from '@/contracts/sse';
import { decimalString } from '@/contracts/money';
import { allowedActions } from '@/contracts/permissions';
import { fromDecimal128 } from '@/server/db/decimal';
import { Beneficiary, Bill, BillDocument, BillEvent as BillEventModel } from '@/server/db/models';
import { formatUtcDate } from '@/server/domain/deadline';
import { distanceBps, estimatedCost, homePrecision, savings, savingsPercent } from '@/server/domain/rateMath';

export interface BillListQuery {
  state?: BillState;
  base?: string;
  quote?: string;
}

export async function listBills(query: BillListQuery, demoMode: boolean): Promise<BillSummary[]> {
  const filter: Record<string, string> = {};
  if (query.state) filter.state = query.state;
  if (query.base) filter.billCurrency = query.base;
  if (query.quote) filter.homeCurrency = query.quote;
  const docs = await Bill.find(filter).sort({ createdAt: -1 }).lean();
  const beneficiaries = await loadBeneficiaries(docs.map((doc) => doc.beneficiaryId).filter(Boolean));
  return docs.map((doc) => toSummary(asBill(doc), beneficiaries, demoMode));
}

export async function billDetail(id: string, demoMode: boolean): Promise<BillDetail | null> {
  const doc = await Bill.findById(id).lean();
  if (!doc) return null;
  const bill = asBill(doc);
  const [beneficiaries, documents, events] = await Promise.all([
    loadBeneficiaries(bill.beneficiaryId ? [bill.beneficiaryId] : []),
    BillDocument.find({ billId: doc._id }).sort({ createdAt: 1 }).lean(),
    BillEventModel.find({ billId: doc._id }).sort({ ts: -1 }).lean(),
  ]);
  const summary = toSummary(bill, beneficiaries, demoMode);
  return billDetailSchema.parse({
    ...summary,
    documents: documents.map((document) => ({
      id: String(document._id),
      filename: document.filename,
      mime: document.mime,
      size: document.size,
      sha256: document.sha256,
    })),
    ...(bill.strategy ? { strategy: bill.strategy } : {}),
    events: events.map(toEvent),
  });
}

function toSummary(
  bill: LoadedBill,
  beneficiaries: Map<string, BeneficiarySummary>,
  demoMode: boolean,
): BillSummary {
  const precision = homePrecision(bill.homeCurrency);
  const fee = bill.strategy?.feeEstimate ?? '0';
  const summary: Omit<BillSummary, 'allowedActions'> = {
    id: bill.id,
    state: bill.state,
    vendorName: bill.vendorName,
    invoiceNumber: bill.invoiceNumber,
    pair: { base: bill.billCurrency, quote: bill.homeCurrency },
    amount: bill.billAmount,
    dueDate: bill.dueDate,
    executionDeadline: bill.executionDeadline,
    transferMethod: bill.transferMethod,
    transferReason: bill.transferReason,
    reference: bill.reference || bill.invoiceNumber,
    flags: {},
    ...(bill.entryPrice ? { entryPrice: bill.entryPrice } : {}),
    ...(bill.strategy ? { targetPrice: bill.strategy.targetPrice, strategyMode: bill.strategy.mode } : {}),
    ...(bill.strategy?.maxCost ? { maxCost: bill.strategy.maxCost } : {}),
    ...(bill.lastPrice ? { lastPrice: bill.lastPrice, lastTickAt: bill.lastTickAt } : {}),
  };
  if (bill.entryPrice && bill.lastPrice) {
    summary.savings = savings(bill.billAmount, bill.entryPrice, bill.lastPrice, precision);
    summary.savingsPct = savingsPercent(bill.entryPrice, bill.lastPrice);
  }
  if (bill.lastPrice) {
    summary.estCost = estimatedCost(bill.billAmount, bill.lastPrice, fee, precision);
  }
  if (bill.lastPrice && bill.strategy) {
    summary.distanceToTargetBps = Number(distanceBps(bill.lastPrice, bill.strategy.targetPrice));
  }
  const beneficiary = bill.beneficiaryId ? beneficiaries.get(bill.beneficiaryId) : undefined;
  if (beneficiary) summary.beneficiary = beneficiary;
  return billSummarySchema.parse({
    ...summary,
    allowedActions: allowedActions(
      { state: summary.state, flags: summary.flags, beneficiary },
      { demoMode },
    ),
  });
}

function toEvent(doc: {
  _id: { toString(): string };
  billId: { toString(): string };
  ts: Date;
  type: BillEvent['type'];
  actor: string;
  payload?: unknown;
}): BillEvent {
  const payload =
    doc.payload && typeof doc.payload === 'object' && !Array.isArray(doc.payload)
      ? (doc.payload as Record<string, unknown>)
      : undefined;
  return {
    id: String(doc._id),
    billId: String(doc.billId),
    ts: doc.ts.toISOString(),
    type: doc.type,
    actor: doc.actor,
    ...(payload ? { payload } : {}),
  };
}

async function loadBeneficiaries(
  ids: Array<{ toString(): string } | string>,
): Promise<Map<string, BeneficiarySummary>> {
  const keys = ids.map((id) => String(id));
  if (keys.length === 0) return new Map();
  const docs = await Beneficiary.find({ _id: { $in: keys } }).lean();
  return new Map(docs.map((doc) => [String(doc._id), beneficiarySummary(doc)]));
}

function beneficiarySummary(doc: {
  _id: { toString(): string };
  airwallexBeneficiaryId: string;
  name: string;
  entityType: BeneficiarySummary['entityType'];
  bankCountry: string;
  accountCurrency: string;
  bankName?: string;
  maskedAccount: string;
  transferMethods: BeneficiarySummary['transferMethods'];
  verification?: {
    code: NonNullable<BeneficiarySummary['verification']>['code'];
    nameMatch?: NonNullable<BeneficiarySummary['verification']>['nameMatch'];
    resolvedAccountName?: string;
    checkedAt: Date;
  };
}): BeneficiarySummary {
  return {
    id: String(doc._id),
    airwallexBeneficiaryId: doc.airwallexBeneficiaryId,
    name: doc.name,
    entityType: doc.entityType,
    bankCountry: doc.bankCountry,
    accountCurrency: doc.accountCurrency,
    maskedAccount: doc.maskedAccount,
    transferMethods: doc.transferMethods,
    ...(doc.bankName ? { bankName: doc.bankName } : {}),
    ...(doc.verification
      ? {
          verification: {
            code: doc.verification.code,
            checkedAt: doc.verification.checkedAt.toISOString(),
            ...(doc.verification.nameMatch ? { nameMatch: doc.verification.nameMatch } : {}),
            ...(doc.verification.resolvedAccountName
              ? { resolvedAccountName: doc.verification.resolvedAccountName }
              : {}),
          },
        }
      : {}),
  };
}

interface LoadedBill {
  id: string;
  version: number;
  state: BillState;
  vendorName: string;
  invoiceNumber: string;
  billCurrency: string;
  billAmount: string;
  homeCurrency: string;
  dueDate: string;
  executionDeadline: string;
  transferMethod: TransferMethod;
  transferReason: TransferReason;
  leadDays: number;
  reference?: string;
  beneficiaryId?: string;
  entryPrice?: string;
  lastPrice?: string;
  lastTickAt?: string;
  lastSource?: RateSourceKind;
  strategy?: StrategyDetail;
}

function asBill(doc: {
  _id: { toString(): string };
  version?: number;
  state: BillState;
  vendorName: string;
  invoiceNumber: string;
  billCurrency: string;
  billAmount: { toString(): string };
  homeCurrency: string;
  dueDate: Date;
  executionDeadline: Date;
  transferMethod: TransferMethod;
  transferReason: TransferReason;
  leadDays: number;
  reference?: string | null;
  beneficiaryId?: { toString(): string } | null;
  entry?: { price: { toString(): string } } | null;
  last?: { price: { toString(): string }; at: Date; source: RateSourceKind } | null;
  strategy?: {
    mode: StrategyDetail['mode'];
    targetPrice: { toString(): string };
    maxCost?: { toString(): string };
    feeEstimate: { toString(): string };
    bufferBps: number;
    confirmTicks: number;
    quoteValidityTarget: StrategyDetail['quoteValidityTarget'];
    quoteValidityDeadline: StrategyDetail['quoteValidityDeadline'];
    autosettleCutoff: string;
  } | null;
}): LoadedBill {
  const strategy = doc.strategy
    ? {
        mode: doc.strategy.mode,
        targetPrice: money(doc.strategy.targetPrice),
        feeEstimate: money(doc.strategy.feeEstimate),
        bufferBps: doc.strategy.bufferBps,
        confirmTicks: doc.strategy.confirmTicks,
        quoteValidityTarget: doc.strategy.quoteValidityTarget,
        quoteValidityDeadline: doc.strategy.quoteValidityDeadline,
        autosettleCutoff: doc.strategy.autosettleCutoff,
        ...(doc.strategy.maxCost ? { maxCost: money(doc.strategy.maxCost) } : {}),
      }
    : undefined;
  return {
    id: String(doc._id),
    version: doc.version ?? 0,
    state: doc.state,
    vendorName: doc.vendorName,
    invoiceNumber: doc.invoiceNumber,
    billCurrency: doc.billCurrency,
    billAmount: money(doc.billAmount),
    homeCurrency: doc.homeCurrency,
    dueDate: formatUtcDate(doc.dueDate),
    executionDeadline: formatUtcDate(doc.executionDeadline),
    transferMethod: doc.transferMethod,
    transferReason: doc.transferReason,
    leadDays: doc.leadDays,
    ...(doc.reference ? { reference: doc.reference } : {}),
    ...(doc.beneficiaryId ? { beneficiaryId: String(doc.beneficiaryId) } : {}),
    ...(doc.entry ? { entryPrice: money(doc.entry.price) } : {}),
    ...(doc.last
      ? { lastPrice: money(doc.last.price), lastTickAt: doc.last.at.toISOString(), lastSource: doc.last.source }
      : {}),
    ...(strategy ? { strategy } : {}),
  };
}

function money(value: { toString(): string }): string {
  return decimalString(fromDecimal128(value));
}

export type { LoadedBill };
