import { z } from 'zod';
import { billDetailSchema } from '@/contracts/api';
import { balanceSummarySchema, beneficiaryFormSchemaSchema, beneficiarySummarySchema } from '@/contracts/airwallex';
import { billSummarySchema } from '@/contracts/bill';
import { chartResponseSchema } from '@/contracts/chart';
import type {
  ArmBody,
  BeneficiarySchemaBody,
  ChartQuery,
  ListBillsQuery,
  PatchBillBody,
  PutStrategyBody,
  ResolveBeneficiaryBody,
} from '@/contracts/api';
import type { BillDetail } from '@/contracts/api';
import type { BalanceSummary, BeneficiaryFormSchema } from '@/contracts/airwallex';
import type { BillSummary } from '@/contracts/bill';
import type { ChartResponse } from '@/contracts/chart';
import { DataSourceError, type DataSource, type SimulateOptions } from '@/contracts/data-source';
import { billEventSchema, type BillEvent } from '@/contracts/events';
import type { AppEvent } from '@/contracts/sse';
import { apiPost, apiRequest } from '@/features/data/http';
import { connectStream } from '@/features/data/stream';

const summaries = z.array(billSummarySchema);
const events = z.array(billEventSchema);
const balances = z.array(balanceSummarySchema);
const advanced = z.object({
  transferId: z.string(),
  status: z.string(),
});

function billPath(id: string, suffix = ''): string {
  return `/api/bills/${encodeURIComponent(id)}${suffix}`;
}

function asSummary(detail: BillDetail): BillSummary {
  return billSummarySchema.parse(detail);
}

export function createApiDataSource(): DataSource {
  return {
    async listBills(query?: ListBillsQuery): Promise<BillSummary[]> {
      const params = new URLSearchParams();
      if (query?.state) params.set('state', query.state);
      if (query?.base) params.set('base', query.base);
      if (query?.quote) params.set('quote', query.quote);
      const search = params.toString();
      return apiRequest(`/api/bills${search ? `?${search}` : ''}`, summaries);
    },
    getBill(id: string): Promise<BillDetail> {
      return apiRequest(billPath(id), billDetailSchema);
    },
    getChart(id: string, query: ChartQuery): Promise<ChartResponse> {
      return apiRequest(`${billPath(id, '/chart')}?range=${query.range}`, chartResponseSchema);
    },
    listEvents(billId: string): Promise<BillEvent[]> {
      return apiRequest(billPath(billId, '/events'), events);
    },
    getBalances(): Promise<BalanceSummary[]> {
      return apiRequest('/api/balances', balances);
    },
    getFormSchema(body: BeneficiarySchemaBody): Promise<BeneficiaryFormSchema> {
      return apiRequest('/api/beneficiaries/schema', beneficiaryFormSchemaSchema, apiPost('/api/beneficiaries/schema', body));
    },
    subscribe(listener: (event: AppEvent) => void): () => void {
      return connectStream({
        onEvent: listener,
        onStatus: () => undefined,
        onPoll: () => undefined,
      });
    },
    async uploadFiles(files: File[]): Promise<BillSummary[]> {
      const form = new FormData();
      for (const file of files) form.append('files', file);
      const uploaded = z.object({ bills: summaries });
      const body = await apiRequest('/api/uploads', uploaded, { method: 'POST', body: form });
      return body.bills;
    },
    async resolveBeneficiary(id: string, body: ResolveBeneficiaryBody): Promise<BillSummary> {
      await apiRequest(
        billPath(id, '/beneficiary'),
        beneficiarySummarySchema,
        apiPost(billPath(id, '/beneficiary'), body),
      );
      return asSummary(await apiRequest(billPath(id), billDetailSchema));
    },
    async review(id: string): Promise<BillSummary> {
      return asSummary(await apiRequest(billPath(id, '/review'), billDetailSchema, apiPost(billPath(id, '/review'))));
    },
    async patchBill(id: string, body: PatchBillBody): Promise<BillSummary> {
      return asSummary(
        await apiRequest(billPath(id), billDetailSchema, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
    },
    async putStrategy(id: string, body: PutStrategyBody): Promise<BillSummary> {
      return asSummary(await apiRequest(billPath(id, '/strategy'), billDetailSchema, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }));
    },
    async arm(id: string, body: ArmBody): Promise<BillSummary> {
      return asSummary(await apiRequest(billPath(id, '/arm'), billDetailSchema, apiPost(billPath(id, '/arm'), body)));
    },
    async pause(id: string): Promise<BillSummary> {
      return asSummary(await apiRequest(billPath(id, '/pause'), billDetailSchema, apiPost(billPath(id, '/pause'))));
    },
    async resume(id: string): Promise<BillSummary> {
      return asSummary(await apiRequest(billPath(id, '/resume'), billDetailSchema, apiPost(billPath(id, '/resume'))));
    },
    async payNow(id: string): Promise<BillSummary> {
      return asSummary(await apiRequest(billPath(id, '/pay-now'), billDetailSchema, apiPost(billPath(id, '/pay-now'))));
    },
    async cancel(id: string): Promise<BillSummary> {
      return asSummary(await apiRequest(billPath(id, '/cancel'), billDetailSchema, apiPost(billPath(id, '/cancel'))));
    },
    async rearm(id: string): Promise<BillSummary> {
      return asSummary(await apiRequest(billPath(id, '/rearm'), billDetailSchema, apiPost(billPath(id, '/rearm'))));
    },
    async simulate(billId: string, options?: SimulateOptions): Promise<BillSummary> {
      return asSummary(
        await apiRequest(
          `/api/demo/bills/${encodeURIComponent(billId)}/simulate`,
          billDetailSchema,
          apiPost(`/api/demo/bills/${billId}/simulate`, options ?? {}),
        ),
      );
    },
    async stopSimulation(billId: string): Promise<BillSummary> {
      return asSummary(
        await apiRequest(
          `/api/demo/bills/${encodeURIComponent(billId)}/simulate/stop`,
          billDetailSchema,
          apiPost(`/api/demo/bills/${billId}/simulate/stop`),
        ),
      );
    },
    async advanceTransfer(billId: string): Promise<BillSummary> {
      const current = await apiRequest(billPath(billId), billDetailSchema);
      const transferId = current.execution?.transferId;
      if (!transferId) {
        throw new DataSourceError(409, {
          code: 'INVALID_STATE',
          message: 'No transfer to advance',
        });
      }
      await apiRequest(
        `/api/demo/transfers/${encodeURIComponent(transferId)}/advance`,
        advanced,
        apiPost(`/api/demo/transfers/${transferId}/advance`, {}),
      );
      return asSummary(await apiRequest(billPath(billId), billDetailSchema));
    },
  };
}
