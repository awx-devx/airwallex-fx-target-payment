import type Decimal from 'decimal.js';
import type {
  ExecutionSummary,
  QuoteSummary,
  QuoteValidity,
  TransferMethod,
  TransferReason,
} from '@/contracts/airwallex';

export interface RateTick {
  price: Decimal;
  ts: Date;
  source: 'SIMULATED' | 'AIRWALLEX';
  conversionDate?: string;
}

export interface RateSource {
  getIndicative(input: {
    buy: string;
    sell: string;
    buyAmount: Decimal;
    conversionDate?: string;
  }): Promise<RateTick>;
}

export interface QuoteProvider {
  lock(input: {
    buy: string;
    sell: string;
    buyAmount: Decimal;
    validity: QuoteValidity;
  }): Promise<QuoteSummary>;
}

export interface CreateTransferInput {
  billId: string;
  attempt: number;
  beneficiaryId: string;
  transferCurrency: string;
  transferAmount: string;
  sourceCurrency: string;
  sourceAmount: string;
  rate: string;
  transferMethod: TransferMethod;
  reason: TransferReason;
  reference: string;
  mode: ExecutionSummary['mode'];
}

export interface TransferRef {
  transferId: string;
  requestId: string;
}

export interface PaymentsGateway {
  createTransfer(input: CreateTransferInput): Promise<TransferRef>;
  cancelTransfer(id: string): Promise<void>;
  getTransfer(id: string): Promise<ExecutionSummary>;
  getBalances(): Promise<
    Array<{
      currency: string;
      available: string;
      pending: string;
      reserved: string;
      total: string;
    }>
  >;
  upsertBeneficiary(input: {
    billId: string;
    name: string;
  }): Promise<{ id: string }>;
}
