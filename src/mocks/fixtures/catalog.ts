import type {
  AccountVerification,
  AccountVerificationCode,
  BalanceSummary,
  ExecutionSummary,
  FailureCategory,
  FundingStatus,
  NameMatch,
  TransferStatus,
} from '@/contracts/airwallex';
import { BILL_STATES } from '@/contracts/bill';
import {
  BILL_EVENT_TYPES,
  type BillEvent,
  type BillEventType,
} from '@/contracts/events';
import { failureCategory } from '@/contracts/airwallex-errors';
import {
  beneficiary,
  buildBill,
  execution,
  FIXTURE_NOW,
} from '@/mocks/fixtures/build';

const verified = (
  nameMatch: NameMatch,
  name = 'Acme GmbH',
): AccountVerification => ({
  code: 'VERIFIED',
  nameMatch,
  resolvedAccountName: name,
  resolvedBankName: 'Commerzbank',
  checkedAt: FIXTURE_NOW,
});

const codeOnly = (code: AccountVerificationCode): AccountVerification => ({
  code,
  checkedAt: FIXTURE_NOW,
});

export const verificationCatalog: AccountVerification[] = [
  verified('FULL_MATCH'),
  verified('PARTIAL_MATCH', 'Acme GMBH'),
  verified('FULL_MATCH_INCORRECT_TYPE'),
  verified('PARTIAL_MATCH_INCORRECT_TYPE'),
  verified('NOT_MATCHED', 'Other GmbH'),
  codeOnly('INVALID'),
  codeOnly('CANNOT_VERIFY'),
  codeOnly('EXTERNAL_SERVICE_UNAVAILABLE'),
  codeOnly('NOT_SUPPORTED'),
];

const acme = beneficiary({
  id: 'bf-acme',
  name: 'Acme GmbH',
  country: 'DE',
  currency: 'EUR',
  maskedAccount: '••••3000',
  bankName: 'Commerzbank',
  verification: verificationCatalog[0],
});

const northwind = beneficiary({
  id: 'bf-northwind',
  name: 'Northwind Ltd',
  country: 'GB',
  currency: 'GBP',
  maskedAccount: '••••4455',
  bankName: 'Barclays',
  verification: verified('PARTIAL_MATCH', 'Northwind Limited'),
});

const bharat = beneficiary({
  id: 'bf-bharat',
  name: 'Bharat Textiles',
  country: 'IN',
  currency: 'INR',
  maskedAccount: '••••8821',
  bankName: 'HDFC Bank',
  methods: ['LOCAL', 'SWIFT'],
  verification: codeOnly('NOT_SUPPORTED'),
});

const kyoto = beneficiary({
  id: 'bf-kyoto',
  name: 'Kyoto Kikai K.K.',
  country: 'JP',
  currency: 'JPY',
  maskedAccount: '••••1190',
  bankName: 'MUFG',
  methods: ['SWIFT'],
  verification: codeOnly('NOT_SUPPORTED'),
});

const TRANSFER_STATUSES: TransferStatus[] = [
  'IN_APPROVAL',
  'APPROVAL_RECALLED',
  'APPROVAL_REJECTED',
  'APPROVAL_BLOCKED',
  'SCHEDULED',
  'OVERDUE',
  'PROCESSING',
  'SENT',
  'PAID',
  'FAILED',
  'CANCELLED',
];

const FUNDING_STATUSES: FundingStatus[] = [
  'REQUIRES_FUNDING_CONFIRMATION',
  'SCHEDULED',
  'PROCESSING',
  'FUNDED',
  'FAILED',
  'CANCELLED',
  'REVERSED',
];

const FAILURES: Array<{ category: FailureCategory; type: string }> = [
  { category: 'BENEFICIARY_DETAILS', type: 'INVALID_ACCOUNT_NAME_OR_NUMBER' },
  { category: 'ACCOUNT', type: 'ACCOUNT_CLOSED' },
  { category: 'RETURNED', type: 'BENEFICIARY_BANK_RETURNED' },
  { category: 'FUNDS_OR_LIMITS', type: 'INSUFFICIENT_FUNDS' },
  { category: 'COMPLIANCE', type: 'TM_SUSPENDED' },
  { category: 'CLIENT', type: 'CLIENT_REQUESTED' },
  { category: 'SYSTEM', type: 'SYSTEM_ERROR' },
];

export const executionCatalog: ExecutionSummary[] = [
  ...TRANSFER_STATUSES.map((status, index) =>
    execution({
      id: `st${index}`,
      billId: 'bill-catalog',
      status,
      currency: 'EUR',
      amount: '250000.00',
      rate: '1.08000',
      fundingStatus: FUNDING_STATUSES[index % FUNDING_STATUSES.length],
    }),
  ),
  ...FAILURES.map((failure, index) =>
    execution({
      id: `fl${index}`,
      billId: 'bill-failed',
      status: 'FAILED',
      currency: 'EUR',
      amount: '250000.00',
      rate: '1.08000',
      fundingStatus: 'FAILED',
      failure: {
        code: '90502',
        message: failure.type,
        reasonCodes: [failure.type],
        category: failureCategory(failure.type),
      },
    }),
  ),
  execution({
    id: 'late',
    billId: 'bill-failed',
    status: 'FAILED',
    currency: 'EUR',
    amount: '250000.00',
    rate: '1.08200',
    lateFailureWatchUntil: '2026-10-04T14:00:00.000Z',
    failure: {
      code: '90502',
      message: 'Returned after paid',
      reasonCodes: ['BENEFICIARY_BANK_RETURNED'],
      category: 'RETURNED',
    },
  }),
];

const sentExecution = executionCatalog.find((item) => item.status === 'SENT');
const paidExecution = executionCatalog.find(
  (item) => item.status === 'PAID' && !item.failure,
);
const failedExecution = executionCatalog.find(
  (item) => item.failure?.category === 'BENEFICIARY_DETAILS',
);

function findStatus(status: TransferStatus): ExecutionSummary {
  const found = executionCatalog.find(
    (item) => item.status === status && item.transferId.includes('st'),
  );
  if (!found) throw new Error(`missing ${status}`);
  return found;
}

export const bills = [
  buildBill({
    id: 'bill-draft',
    state: 'DRAFT',
    vendorName: 'Draft Components GmbH',
    invoiceNumber: 'DC-2026-0101',
    pair: { base: 'EUR', quote: 'USD' },
    amount: '18000.00',
    dueDate: '2026-10-28',
    executionDeadline: '2026-10-26',
    lastPrice: '1.08500',
  }),
  buildBill({
    id: 'bill-ready',
    state: 'READY',
    vendorName: 'Acme GmbH',
    invoiceNumber: 'AC-2026-0142',
    pair: { base: 'EUR', quote: 'USD' },
    amount: '250000.00',
    dueDate: '2026-10-13',
    executionDeadline: '2026-10-09',
    lastPrice: '1.08500',
    targetPrice: '1.07632',
    strategyMode: 'TARGET_RATE',
    beneficiary: acme,
  }),
  buildBill({
    id: 'bill-watching',
    state: 'WATCHING',
    vendorName: 'Acme GmbH',
    invoiceNumber: 'AC-2026-0200',
    pair: { base: 'EUR', quote: 'USD' },
    amount: '250000.00',
    dueDate: '2026-10-13',
    executionDeadline: '2026-10-09',
    entryPrice: '1.08500',
    targetPrice: '1.07632',
    strategyMode: 'TARGET_RATE',
    lastPrice: '1.08200',
    beneficiary: acme,
  }),
  buildBill({
    id: 'bill-paused',
    state: 'PAUSED',
    vendorName: 'Harbour Supplies Pty Ltd',
    invoiceNumber: 'HS-441',
    pair: { base: 'AUD', quote: 'USD' },
    amount: '64000.00',
    dueDate: '2026-10-20',
    executionDeadline: '2026-10-16',
    entryPrice: '0.66000',
    targetPrice: '0.64800',
    strategyMode: 'TARGET_RATE',
    lastPrice: '0.65500',
    beneficiary: beneficiary({
      id: 'bf-harbour',
      name: 'Harbour Supplies Pty Ltd',
      country: 'AU',
      currency: 'AUD',
      maskedAccount: '••••2219',
      verification: codeOnly('CANNOT_VERIFY'),
    }),
  }),
  buildBill({
    id: 'bill-target-hit',
    state: 'WATCHING',
    vendorName: 'Acme GmbH',
    invoiceNumber: 'AC-2026-0208',
    pair: { base: 'EUR', quote: 'USD' },
    amount: '250000.00',
    dueDate: '2026-10-13',
    executionDeadline: '2026-10-09',
    entryPrice: '1.08500',
    targetPrice: '1.07632',
    strategyMode: 'TARGET_RATE',
    lastPrice: '1.08200',
    beneficiary: acme,
  }),
  buildBill({
    id: 'bill-deadline',
    state: 'WATCHING',
    vendorName: 'Northwind Ltd',
    invoiceNumber: 'NW-7781',
    pair: { base: 'GBP', quote: 'USD' },
    amount: '120000.00',
    dueDate: '2026-10-04',
    executionDeadline: '2026-10-01',
    entryPrice: '1.28000',
    targetPrice: '1.25000',
    maxCost: '150000.00',
    strategyMode: 'MAX_COST',
    lastPrice: '1.27400',
    beneficiary: { ...northwind, verification: verificationCatalog[1] },
    flags: { nameMismatch: true },
  }),
  buildBill({
    id: 'bill-autosettle',
    state: 'WATCHING',
    vendorName: 'Bharat Textiles',
    invoiceNumber: 'BT-19',
    pair: { base: 'INR', quote: 'USD' },
    amount: '8500000.00',
    dueDate: '2026-10-04',
    executionDeadline: '2026-10-01',
    entryPrice: '0.01200',
    targetPrice: '0.01120',
    strategyMode: 'TARGET_RATE',
    lastPrice: '0.01190',
    transferMethod: 'LOCAL',
    beneficiary: bharat,
    flags: { noReferenceHistory: true },
  }),
  buildBill({
    id: 'bill-approved',
    state: 'WATCHING',
    vendorName: 'Lion City Parts Pte Ltd',
    invoiceNumber: 'LC-88',
    pair: { base: 'SGD', quote: 'USD' },
    amount: '42000.00',
    dueDate: '2026-10-18',
    executionDeadline: '2026-10-15',
    entryPrice: '0.76000',
    targetPrice: '0.74800',
    strategyMode: 'TARGET_RATE',
    lastPrice: '0.75500',
    beneficiary: beneficiary({
      id: 'bf-lion',
      name: 'Lion City Parts Pte Ltd',
      country: 'SG',
      currency: 'SGD',
      maskedAccount: '••••9033',
      verification: codeOnly('EXTERNAL_SERVICE_UNAVAILABLE'),
    }),
  }),
  buildBill({
    id: 'bill-executing',
    state: 'EXECUTING',
    vendorName: 'Nordic Glass AB',
    invoiceNumber: 'NG-300',
    pair: { base: 'SEK', quote: 'USD' },
    amount: '310000.00',
    dueDate: '2026-10-22',
    executionDeadline: '2026-10-16',
    entryPrice: '0.09500',
    targetPrice: '0.09200',
    strategyMode: 'TARGET_RATE',
    lastPrice: '0.09180',
    transferMethod: 'SWIFT',
    beneficiary: beneficiary({
      id: 'bf-nordic',
      name: 'Nordic Glass AB',
      country: 'SE',
      currency: 'SEK',
      maskedAccount: '••••4410',
      methods: ['SWIFT'],
      verification: codeOnly('NOT_SUPPORTED'),
    }),
  }),
  buildBill({
    id: 'bill-in-flight',
    state: 'IN_FLIGHT',
    vendorName: 'Kyoto Kikai K.K.',
    invoiceNumber: 'KK-17',
    pair: { base: 'JPY', quote: 'USD' },
    amount: '8500000',
    dueDate: '2026-10-24',
    executionDeadline: '2026-10-20',
    entryPrice: '0.006800',
    targetPrice: '0.006600',
    strategyMode: 'TARGET_RATE',
    lastPrice: '0.006700',
    transferMethod: 'SWIFT',
    beneficiary: kyoto,
    execution: sentExecution ?? findStatus('SENT'),
    flags: { awxApproval: false },
  }),
  buildBill({
    id: 'bill-paid',
    state: 'PAID',
    vendorName: 'Acme GmbH',
    invoiceNumber: 'AC-2026-0090',
    pair: { base: 'EUR', quote: 'USD' },
    amount: '80000.00',
    dueDate: '2026-09-20',
    executionDeadline: '2026-09-17',
    entryPrice: '1.09000',
    targetPrice: '1.08000',
    strategyMode: 'TARGET_RATE',
    lastPrice: '1.07800',
    beneficiary: acme,
    execution: paidExecution ?? findStatus('PAID'),
  }),
  buildBill({
    id: 'bill-failed',
    state: 'FAILED',
    vendorName: 'Bharat Textiles',
    invoiceNumber: 'BT-04',
    pair: { base: 'INR', quote: 'USD' },
    amount: '1500000.00',
    dueDate: '2026-10-08',
    executionDeadline: '2026-10-05',
    entryPrice: '0.01200',
    targetPrice: '0.01150',
    strategyMode: 'TARGET_RATE',
    lastPrice: '0.01180',
    beneficiary: bharat,
    execution: failedExecution ?? findStatus('FAILED'),
  }),
  buildBill({
    id: 'bill-cancelled',
    state: 'CANCELLED',
    vendorName: 'Northwind Ltd',
    invoiceNumber: 'NW-1002',
    pair: { base: 'GBP', quote: 'USD' },
    amount: '15000.00',
    dueDate: '2026-10-30',
    executionDeadline: '2026-10-27',
    lastPrice: '1.27000',
    beneficiary: northwind,
    execution: findStatus('CANCELLED'),
  }),
];

export const balances: BalanceSummary[] = [
  {
    currency: 'USD',
    available: '2500000.00',
    pending: '12000.00',
    reserved: '270025.00',
    total: '2782025.00',
    asOf: FIXTURE_NOW,
  },
  {
    currency: 'EUR',
    available: '40000.00',
    pending: '0.00',
    reserved: '0.00',
    total: '40000.00',
    asOf: FIXTURE_NOW,
  },
];

const eventTypes = new Set<BillEventType>(BILL_EVENT_TYPES);

export const events: BillEvent[] = BILL_EVENT_TYPES.map((type, index) => ({
  id: `ev-${type.toLowerCase()}`,
  billId:
    type === 'PAID'
      ? 'bill-paid'
      : type === 'FAILED'
        ? 'bill-failed'
        : 'bill-watching',
  ts: `2026-10-01T${String(index).padStart(2, '0')}:00:00.000Z`,
  type,
  actor: 'system',
  payload: { type },
}));

export function assertFixtureCoverage(): void {
  const states = new Set(bills.map((bill) => bill.state));
  for (const state of BILL_STATES) {
    if (!states.has(state)) throw new Error(`fixture bills missing ${state}`);
  }
  const statuses = new Set(executionCatalog.map((item) => item.status));
  for (const status of TRANSFER_STATUSES) {
    if (!statuses.has(status))
      throw new Error(`fixture executions missing ${status}`);
  }
  const funding = new Set(
    executionCatalog.flatMap((item) =>
      item.funding ? [item.funding.status] : [],
    ),
  );
  for (const status of FUNDING_STATUSES) {
    if (!funding.has(status))
      throw new Error(`fixture funding missing ${status}`);
  }
  const categories = new Set(
    executionCatalog.flatMap((item) =>
      item.failure ? [item.failure.category] : [],
    ),
  );
  const expectedCategories: FailureCategory[] = [
    'BENEFICIARY_DETAILS',
    'ACCOUNT',
    'RETURNED',
    'FUNDS_OR_LIMITS',
    'COMPLIANCE',
    'CLIENT',
    'SYSTEM',
  ];
  for (const category of expectedCategories) {
    if (!categories.has(category))
      throw new Error(`fixture failures missing ${category}`);
  }
  if (eventTypes.size !== BILL_EVENT_TYPES.length) {
    throw new Error('event catalog is short');
  }
}
