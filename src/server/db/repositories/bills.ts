import {
  executionSummarySchema,
  type BeneficiarySummary,
  type ExecutionSummary,
  type TransferMethod,
  type TransferReason,
} from '@/contracts/airwallex';
import { billDetailSchema, type BillDetail, type StrategyDetail } from '@/contracts/api';
import { billSummarySchema, type BillState, type BillSummary } from '@/contracts/bill';
import type { BillEvent } from '@/contracts/events';
import type { RateSourceKind } from '@/contracts/sse';
import { decimalString } from '@/contracts/money';
import { allowedActions } from '@/contracts/permissions';
import { fromDecimal128 } from '@/server/db/decimal';
import { Beneficiary, Bill, BillDocument, BillEvent as BillEventModel, Execution, RateTick } from '@/server/db/models';
import { formatUtcDate } from '@/server/domain/deadline';
import { extractedBillSchema, extractionStatusSchema } from '@/contracts/extraction';
import { checkBill } from '@/server/domain/billChecks';
import { showsSimulated, type SimulationOutcome } from '@/server/domain/simulation';
import { distanceBps, estimatedCost, homePrecision, savings, savingsPercent } from '@/server/domain/rateMath';

export interface BillListQuery {
  state?: BillState;
  base?: string;
  quote?: string;
}

export interface BillReadContext {
  nowMs?: number;
  pollIntervalMs?: number;
  historySource?: 'frankfurter' | 'none' | 'simulated';
}

export async function listBills(
  query: BillListQuery,
  demoMode: boolean,
  today: string,
  read?: BillReadContext,
): Promise<BillSummary[]> {
  const filter: Record<string, string> = {};
  if (query.state) filter.state = query.state;
  if (query.base) filter.billCurrency = query.base;
  if (query.quote) filter.homeCurrency = query.quote;
  const docs = await Bill.find(filter).sort({ createdAt: -1 }).lean();
  const beneficiaries = await loadBeneficiaries(docs.map((doc) => doc.beneficiaryId).filter(Boolean));
  const executions = await loadExecutions(docs.map((doc) => String(doc._id)));
  const loaded = docs.map((doc) => asBill(doc));
  await clearCopiedSessionMarks(loaded);
  return loaded.map((bill) => toSummary(bill, beneficiaries, demoMode, today, read, executions.get(bill.id)));
}

export async function billDetail(
  id: string,
  demoMode: boolean,
  today: string,
  read?: BillReadContext,
): Promise<BillDetail | null> {
  const doc = await Bill.findById(id).lean();
  if (!doc) return null;
  const bill = asBill(doc);
  await clearCopiedSessionMarks([bill]);
  const [beneficiaries, documents, events] = await Promise.all([
    loadBeneficiaries(bill.beneficiaryId ? [bill.beneficiaryId] : []),
    BillDocument.find({ billId: doc._id }).sort({ createdAt: 1 }).lean(),
    BillEventModel.find({ billId: doc._id }).sort({ ts: -1 }).lean(),
  ]);
  const executions = await loadExecutions([bill.id]);
  const summary = toSummary(bill, beneficiaries, demoMode, today, read, executions.get(bill.id));
  return billDetailSchema.parse({
    ...summary,
    documents: documents.map((document) => ({
      id: String(document._id),
      filename: document.filename,
      mime: document.mime,
      size: document.size,
      sha256: document.sha256,
      ...extractionView(document.extraction),
    })),
    ...(bill.strategy ? { strategy: bill.strategy } : {}),
    events: events.map(toEvent),
  });
}

function toSummary(
  bill: LoadedBill,
  beneficiaries: Map<string, BeneficiarySummary>,
  demoMode: boolean,
  today: string,
  read?: BillReadContext,
  execution?: ExecutionSummary,
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
    flags: flagsFor(bill, today, read, execution),
    ...(execution ? { execution } : {}),
    ...(bill.entryPrice ? { entryPrice: bill.entryPrice } : {}),
    ...(bill.strategy ? { targetPrice: bill.strategy.targetPrice, strategyMode: bill.strategy.mode } : {}),
    ...(bill.strategy?.maxCost ? { maxCost: bill.strategy.maxCost } : {}),
    ...(bill.lastPrice ? { lastPrice: bill.lastPrice, lastTickAt: bill.lastTickAt } : {}),
    ...(bill.safetyNetTransferId ? { safetyNetTransferId: bill.safetyNetTransferId } : {}),
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
      {
        state: summary.state,
        flags: summary.flags,
        beneficiary,
        ...(execution ? { execution } : {}),
      },
      {
        demoMode,
        simulationRunning:
          bill.simulation?.outcome === 'RUNNING' &&
          (bill.state === 'WATCHING' || bill.state === 'PAUSED'),
      },
    ),
  });
}

function flagsFor(
  bill: LoadedBill,
  today: string,
  read?: BillReadContext,
  execution?: ExecutionSummary,
): BillSummary['flags'] {
  const price = bill.lastPrice ?? bill.entryPrice;
  const usdEquivalent = price
    ? estimatedCost(bill.billAmount, price, bill.strategy?.feeEstimate ?? '0', homePrecision(bill.homeCurrency))
    : undefined;
  const flags = checkBill({
    billCurrency: bill.billCurrency,
    homeCurrency: bill.homeCurrency,
    amount: bill.billAmount,
    dueDate: bill.dueDate,
    today,
    ...(usdEquivalent ? { usdEquivalent } : {}),
  }).flags;
  if (bill.insufficientBalance) flags.insufficientBalance = true;
  if (execution?.status === 'OVERDUE') flags.overdue = true;
  if (execution && (execution.status === 'IN_APPROVAL' || execution.status.startsWith('APPROVAL_'))) {
    flags.awxApproval = true;
  }
  if (read?.historySource === 'none') flags.noReferenceHistory = true;
  if (
    read?.nowMs !== undefined &&
    read.pollIntervalMs &&
    (bill.state === 'WATCHING' || bill.state === 'PAUSED') &&
    (!bill.lastTickAt || read.nowMs - Date.parse(bill.lastTickAt) > 2 * read.pollIntervalMs)
  ) {
    flags.stale = true;
  }
  if (showsSimulated(bill.simulation?.outcome)) flags.simulated = true;
  return flags;
}

function extractionView(value: unknown): { extraction?: BillDetail['documents'][number]['extraction'] } {
  if (!value || typeof value !== 'object') return {};
  const record = value as { status?: unknown; result?: unknown; error?: unknown };
  const status = extractionStatusSchema.safeParse(record.status);
  if (!status.success) return {};
  const result = extractedBillSchema.safeParse(record.result);
  return {
    extraction: {
      status: status.data,
      ...(result.success ? { result: result.data } : {}),
      ...(typeof record.error === 'string' ? { error: record.error } : {}),
    },
  };
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

async function loadExecutions(ids: string[]): Promise<Map<string, ExecutionSummary>> {
  const map = new Map<string, ExecutionSummary>();
  if (ids.length === 0) return map;
  const docs = await Execution.find({ billId: { $in: ids }, airwallexTransferId: { $exists: true } })
    .sort({ active: -1 })
    .lean();
  for (const doc of docs) {
    const key = String(doc.billId);
    if (map.has(key)) continue;
    const raw = doc.raw;
    if (!raw || typeof raw !== 'object' || !('summary' in raw)) continue;
    const parsed = executionSummarySchema.safeParse((raw as { summary?: unknown }).summary);
    if (parsed.success) map.set(key, parsed.data);
  }
  return map;
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
  insufficientBalance?: boolean;
  safetyNetTransferId?: string;
  simulation?: { outcome: SimulationOutcome };
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
  insufficientBalance?: boolean | null;
  safetyNet?: { transferId?: string | null } | null;
  simulation?: { outcome: SimulationOutcome } | null;
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
    ...(doc.insufficientBalance ? { insufficientBalance: true } : {}),
    ...(doc.safetyNet?.transferId ? { safetyNetTransferId: doc.safetyNet.transferId } : {}),
    ...(doc.simulation ? { simulation: { outcome: doc.simulation.outcome } } : {}),
    ...(strategy ? { strategy } : {}),
  };
}

function money(value: { toString(): string }): string {
  return decimalString(fromDecimal128(value));
}

/**
 * A sample copies the latest pair tick onto the bill. When that tick was another
 * bill's Simulate session, drop it and show the shared pair mark instead.
 */
async function clearCopiedSessionMarks(bills: LoadedBill[]): Promise<void> {
  const session = await RateTick.find({ 'meta.simId': { $exists: true } })
    .select({ price: 1, 'meta.billId': 1 })
    .lean();
  if (session.length === 0) return;
  const owners = new Set(session.map((tick) => String(tick.meta.billId)));
  const prices = new Set(session.map((tick) => decimalString(fromDecimal128(tick.price))));
  const copied = bills.filter((bill) => bill.lastPrice && !owners.has(bill.id) && prices.has(bill.lastPrice));
  if (copied.length === 0) return;
  const market = await latestSharedMarks();
  for (const bill of copied) {
    const tick = market.get(`${bill.billCurrency}:${bill.homeCurrency}`);
    if (!tick) {
      bill.lastPrice = undefined;
      bill.lastTickAt = undefined;
      bill.lastSource = undefined;
      continue;
    }
    bill.lastPrice = tick.price;
    bill.lastTickAt = tick.at;
    bill.lastSource = tick.source;
  }
}

async function latestSharedMarks(): Promise<
  Map<string, { price: string; at: string; source: RateSourceKind }>
> {
  const rows = (await RateTick.aggregate([
    { $match: { 'meta.simId': { $exists: false } } },
    { $sort: { ts: -1 } },
    {
      $group: {
        _id: { base: '$meta.base', quote: '$meta.quote' },
        price: { $first: '$price' },
        ts: { $first: '$ts' },
        source: { $first: '$meta.source' },
      },
    },
  ])) as {
    _id: { base: string; quote: string };
    price: { toString(): string };
    ts: Date;
    source: RateSourceKind;
  }[];
  const marks = new Map<string, { price: string; at: string; source: RateSourceKind }>();
  for (const row of rows) {
    const source = row.source === 'AIRWALLEX' || row.source === 'REFERENCE' ? row.source : 'SIMULATED';
    marks.set(`${row._id.base}:${row._id.quote}`, {
      price: decimalString(fromDecimal128(row.price)),
      at: row.ts.toISOString(),
      source,
    });
  }
  return marks;
}

export type { LoadedBill };
