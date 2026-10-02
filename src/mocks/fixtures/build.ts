import type {
  AccountVerification,
  BeneficiarySummary,
  ExecutionSummary,
  FundingStatus,
  QuoteSummary,
  TransferStatus,
} from '@/contracts/airwallex';
import type {
  BillFlags,
  BillSummary,
  Pair,
  StrategyMode,
} from '@/contracts/bill';
import { requireCurrency } from '@/contracts/currencies';
import { D, formatDecimal } from '@/contracts/money';
import { allowedActions } from '@/contracts/permissions';

export const FIXTURE_NOW = '2026-10-01T14:00:00.000Z';

const TENTATIVE_STATUSES = new Set<TransferStatus>([
  'IN_APPROVAL',
  'APPROVAL_RECALLED',
  'APPROVAL_REJECTED',
  'APPROVAL_BLOCKED',
]);

export function quoteAt(input: {
  id: string;
  price: string;
  buyAmount: string;
  sellPrecision?: number;
  validToAt?: string;
  expired?: boolean;
}): QuoteSummary {
  const sellPrecision = input.sellPrecision ?? 2;
  const mid = D(input.price).mul('0.9995');
  const spread = D(input.price).minus(mid).div(mid).mul(10000);
  return {
    airwallexQuoteId: input.id,
    price: input.price,
    buyAmount: input.buyAmount,
    sellAmount: formatDecimal(
      D(input.buyAmount).mul(input.price),
      sellPrecision,
    ),
    clientRate: input.price,
    clientRateOriented: input.price,
    midPrice: formatDecimal(mid, 6),
    spreadBps: spread.toDecimalPlaces(1).toNumber(),
    validity: 'MIN_1',
    validFromAt: input.expired ? '2026-10-01T12:00:00.000Z' : FIXTURE_NOW,
    validToAt:
      input.validToAt ??
      (input.expired ? '2026-10-01T12:30:00.000Z' : '2026-10-01T14:30:00.000Z'),
    usage: 'SINGLE_USE',
    conversionDate: '2026-10-02',
  };
}

export function beneficiary(input: {
  id: string;
  name: string;
  country: string;
  currency: string;
  maskedAccount: string;
  bankName?: string;
  methods?: Array<'LOCAL' | 'SWIFT'>;
  verification?: AccountVerification;
}): BeneficiarySummary {
  return {
    id: input.id,
    airwallexBeneficiaryId: `awx_${input.id}`,
    name: input.name,
    entityType: 'COMPANY',
    bankCountry: input.country,
    accountCurrency: input.currency,
    bankName: input.bankName,
    maskedAccount: input.maskedAccount,
    transferMethods: input.methods ?? ['LOCAL'],
    verification: input.verification,
  };
}

export function execution(input: {
  id: string;
  billId: string;
  status: TransferStatus;
  currency: string;
  amount: string;
  rate: string;
  method?: 'LOCAL' | 'SWIFT';
  fundingStatus?: FundingStatus;
  failure?: ExecutionSummary['failure'];
  mode?: ExecutionSummary['mode'];
  lateFailureWatchUntil?: string;
  attempt?: number;
}): ExecutionSummary {
  const homePrecision = requireCurrency('USD').payoutPrecision;
  const source = formatDecimal(D(input.amount).mul(input.rate), homePrecision);
  const fee = formatDecimal(D(source).mul('0.001'), homePrecision);
  return {
    transferId: `00000000-0000-4000-8000-${input.id.padStart(12, '0')}`,
    shortReferenceId: `P261001-${input.id.slice(0, 7).toUpperCase()}`,
    requestId: `tr:${input.billId}:${input.attempt ?? 1}`,
    status: input.status,
    funding: { status: input.fundingStatus ?? 'FUNDED' },
    transferMethod: input.method ?? 'LOCAL',
    rate: input.rate,
    sourceAmount: source,
    sourceCurrency: 'USD',
    transferAmount: input.amount,
    transferCurrency: input.currency,
    amountPayerPays: formatDecimal(D(source).plus(fee), homePrecision),
    amountBeneficiaryReceives: input.amount,
    fee: { amount: fee, currency: 'USD', paidBy: 'PAYER' },
    swiftChargeOption: input.method === 'SWIFT' ? 'PAYER' : undefined,
    amountsTentative: TENTATIVE_STATUSES.has(input.status),
    dispatchDate:
      input.status === 'PAID' || input.status === 'SENT'
        ? '2026-10-01'
        : undefined,
    failure: input.failure,
    lateFailureWatchUntil: input.lateFailureWatchUntil,
    updatedAt: FIXTURE_NOW,
    mode: input.mode ?? 'TARGET',
  };
}

export interface BillDraft {
  id: string;
  state: BillSummary['state'];
  vendorName: string;
  invoiceNumber: string;
  pair: Pair;
  amount: string;
  dueDate: string;
  executionDeadline: string;
  entryPrice?: string;
  targetPrice?: string;
  maxCost?: string;
  strategyMode?: StrategyMode;
  lastPrice?: string;
  transferMethod?: 'LOCAL' | 'SWIFT';
  reference?: string;
  beneficiary?: BeneficiarySummary;
  execution?: ExecutionSummary;
  flags?: BillFlags;
}

export function buildBill(draft: BillDraft): BillSummary {
  const precision = requireCurrency(draft.pair.quote).payoutPrecision;
  let savings: string | undefined;
  let savingsPct: string | undefined;
  let estCost: string | undefined;
  let distanceToTargetBps: number | undefined;
  if (draft.entryPrice && draft.lastPrice) {
    const delta = D(draft.entryPrice).minus(draft.lastPrice);
    savings = formatDecimal(D(draft.amount).mul(delta), precision);
    savingsPct = formatDecimal(delta.div(draft.entryPrice), 2);
  }
  if (draft.lastPrice) {
    estCost = formatDecimal(D(draft.amount).mul(draft.lastPrice), precision);
  }
  if (draft.lastPrice && draft.targetPrice && !D(draft.lastPrice).isZero()) {
    distanceToTargetBps = D(draft.lastPrice)
      .minus(draft.targetPrice)
      .div(draft.lastPrice)
      .mul(10000)
      .toDecimalPlaces(0)
      .toNumber();
  }
  const summary: Omit<BillSummary, 'allowedActions'> = {
    id: draft.id,
    state: draft.state,
    vendorName: draft.vendorName,
    invoiceNumber: draft.invoiceNumber,
    pair: draft.pair,
    amount: draft.amount,
    dueDate: draft.dueDate,
    executionDeadline: draft.executionDeadline,
    entryPrice: draft.entryPrice,
    targetPrice: draft.targetPrice,
    maxCost: draft.maxCost,
    strategyMode: draft.strategyMode,
    lastPrice: draft.lastPrice,
    lastTickAt: draft.lastPrice ? FIXTURE_NOW : undefined,
    savings,
    savingsPct,
    distanceToTargetBps,
    estCost,
    transferMethod: draft.transferMethod ?? 'LOCAL',
    transferReason: 'bill_payment',
    reference: draft.reference ?? draft.invoiceNumber,
    beneficiary: draft.beneficiary,
    execution: draft.execution,
    flags: draft.flags ?? {},
  };
  return {
    ...summary,
    allowedActions: allowedActions(summary, { demoMode: true }),
  };
}
