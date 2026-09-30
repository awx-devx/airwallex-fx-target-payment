import type {
  ArmBody,
  BeneficiarySchemaBody,
  ChartQuery,
  ListBillsQuery,
  PatchBillBody,
  PutStrategyBody,
  RejectBody,
} from '@/contracts/api';
import type { BillDetail } from '@/contracts/api';
import type { ApiError, BalanceSummary, BeneficiaryFormSchema } from '@/contracts/airwallex';
import type { ApprovalSummary } from '@/contracts/approval';
import type { BillSummary, Role } from '@/contracts/bill';
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
  autoApproveDelaySec?: number;
  advanceEverySec?: number;
}

/**
 * The port `useBills` and the other data hooks call.
 * `mock` is in-memory; `api` will call the REST routes in U7.
 */
export interface DataSource {
  listBills(query?: ListBillsQuery): Promise<BillSummary[]>;
  getBill(id: string): Promise<BillDetail>;
  getChart(id: string, query: ChartQuery): Promise<ChartResponse>;
  listEvents(billId: string): Promise<BillEvent[]>;
  listApprovals(): Promise<ApprovalSummary[]>;
  getBalances(): Promise<BalanceSummary[]>;
  getFormSchema(body: BeneficiarySchemaBody): Promise<BeneficiaryFormSchema>;
  subscribe(listener: (event: AppEvent) => void): () => void;

  patchBill(id: string, body: PatchBillBody, role: Role): Promise<BillSummary>;
  putStrategy(id: string, body: PutStrategyBody, role: Role): Promise<BillSummary>;
  arm(id: string, body: ArmBody, role: Role): Promise<BillSummary>;
  pause(id: string, role: Role): Promise<BillSummary>;
  resume(id: string, role: Role): Promise<BillSummary>;
  payNow(id: string, role: Role): Promise<BillSummary>;
  cancel(id: string, role: Role): Promise<BillSummary>;
  rearm(id: string, role: Role): Promise<BillSummary>;
  approve(approvalId: string, role: Role): Promise<BillSummary>;
  reject(approvalId: string, body: RejectBody, role: Role): Promise<BillSummary>;
  simulate(billId: string, role: Role, options?: SimulateOptions): Promise<BillSummary>;
  stopSimulation(billId: string, role: Role): Promise<BillSummary>;
  advanceTransfer(billId: string, role: Role): Promise<BillSummary>;
}
