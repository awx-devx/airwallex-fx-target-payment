import type {
  ArmBody,
  BeneficiarySchemaBody,
  ChartQuery,
  ListBillsQuery,
  PatchBillBody,
  PutStrategyBody,
} from '@/contracts/api';
import type { BillDetail } from '@/contracts/api';
import type { ApiError, BalanceSummary, BeneficiaryFormSchema } from '@/contracts/airwallex';
import type { BillSummary } from '@/contracts/bill';
import type { ChartResponse } from '@/contracts/chart';
import type { BillEvent } from '@/contracts/events';
import type { AppEvent } from '@/contracts/sse';

export class DataSourceError extends Error {
  readonly status: number;
  readonly error: ApiError;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = 'DataSourceError';
    this.status = status;
    this.error = error;
  }
}

export interface SimulateOptions {
  durationSec?: number;
  overshootBps?: number;
  advanceEverySec?: number;
}

/**
 * The port `useBills` and the other data hooks call.
 * `mock` is in-memory. `api` calls the REST routes and `/api/stream`.
 */
export interface DataSource {
  listBills(query?: ListBillsQuery): Promise<BillSummary[]>;
  getBill(id: string): Promise<BillDetail>;
  getChart(id: string, query: ChartQuery): Promise<ChartResponse>;
  listEvents(billId: string): Promise<BillEvent[]>;
  getBalances(): Promise<BalanceSummary[]>;
  getFormSchema(body: BeneficiarySchemaBody): Promise<BeneficiaryFormSchema>;
  subscribe(listener: (event: AppEvent) => void): () => void;

  patchBill(id: string, body: PatchBillBody): Promise<BillSummary>;
  putStrategy(id: string, body: PutStrategyBody): Promise<BillSummary>;
  arm(id: string, body: ArmBody): Promise<BillSummary>;
  pause(id: string): Promise<BillSummary>;
  resume(id: string): Promise<BillSummary>;
  payNow(id: string): Promise<BillSummary>;
  cancel(id: string): Promise<BillSummary>;
  rearm(id: string): Promise<BillSummary>;
  simulate(billId: string, options?: SimulateOptions): Promise<BillSummary>;
  stopSimulation(billId: string): Promise<BillSummary>;
  advanceTransfer(billId: string): Promise<BillSummary>;
}
