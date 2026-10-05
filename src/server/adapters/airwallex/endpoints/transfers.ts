import type {
  ExecutionSummary,
  TransferMethod,
  TransferReason,
} from '@/contracts/airwallex';
import type { AirwallexClient } from '@/server/adapters/airwallex/client';
import {
  AirwallexError,
  duplicateResourceId,
  isDuplicateRequest,
} from '@/server/adapters/airwallex/errors';
import { mapTransfer } from '@/server/adapters/airwallex/mappers';
import { safetyNetRequestId, transferRequestId } from '@/server/adapters/airwallex/requestIds';

const APP = 'fx-target-payment';

export interface CreateTransferInput {
  billId: string;
  attempt: number;
  beneficiaryId: string;
  transferCurrency: string;
  transferAmount: string;
  sourceCurrency: string;
  transferMethod: TransferMethod;
  quoteId?: string;
  reason: TransferReason;
  reference: string;
  mode: ExecutionSummary['mode'];
}

export async function createTransfer(
  client: AirwallexClient,
  input: CreateTransferInput,
): Promise<ExecutionSummary> {
  const requestId = transferRequestId(input.billId, input.attempt);
  const body: Record<string, unknown> = {
    request_id: requestId,
    beneficiary_id: input.beneficiaryId,
    transfer_currency: input.transferCurrency,
    transfer_amount: input.transferAmount,
    source_currency: input.sourceCurrency,
    transfer_method: input.transferMethod,
    reason: input.reason,
    reference: input.reference,
    fee_paid_by: 'PAYER',
    metadata: { bill_id: input.billId, app: APP },
  };
  if (input.quoteId) body.quote_id = input.quoteId;
  if (input.transferMethod === 'SWIFT') body.swift_charge_option = 'PAYER';
  try {
    const payload = await client.request({
      method: 'POST',
      path: '/transfers/create',
      body,
    });
    return mapTransfer(payload, input.mode);
  } catch (error) {
    if (!(error instanceof AirwallexError) || !isDuplicateRequest(error))
      throw error;
    const id = duplicateResourceId(error);
    if (!id) throw error;
    return getTransfer(client, id, input.mode);
  }
}

/**
 * Future-dated transfer for the Layer B safety net. No quote: the rate stays
 * unlocked until the transfer date.
 * https://www.airwallex.com/docs/api#/Payouts/Transfers/
 */
export async function createScheduledTransfer(
  client: AirwallexClient,
  input: Omit<CreateTransferInput, 'attempt' | 'quoteId' | 'mode'> & { transferDate: string },
): Promise<ExecutionSummary> {
  const requestId = safetyNetRequestId(input.billId);
  const body: Record<string, unknown> = {
    request_id: requestId,
    beneficiary_id: input.beneficiaryId,
    transfer_currency: input.transferCurrency,
    transfer_amount: input.transferAmount,
    source_currency: input.sourceCurrency,
    transfer_method: input.transferMethod,
    transfer_date: input.transferDate,
    lock_rate_on_create: false,
    reason: input.reason,
    reference: input.reference,
    fee_paid_by: 'PAYER',
    metadata: { bill_id: input.billId, app: APP },
  };
  if (input.transferMethod === 'SWIFT') body.swift_charge_option = 'PAYER';
  try {
    const payload = await client.request({
      method: 'POST',
      path: '/transfers/create',
      body,
    });
    return mapTransfer(payload, 'DEADLINE');
  } catch (error) {
    if (!(error instanceof AirwallexError) || !isDuplicateRequest(error)) throw error;
    const id = duplicateResourceId(error);
    if (!id) throw error;
    return getTransfer(client, id, 'DEADLINE');
  }
}

/** Same body as create, without `quote_id` or `request_id`. Called when the user arms. */
export async function validateTransfer(
  client: AirwallexClient,
  input: Omit<CreateTransferInput, 'attempt' | 'quoteId' | 'mode'>,
): Promise<void> {
  const body: Record<string, unknown> = {
    beneficiary_id: input.beneficiaryId,
    transfer_currency: input.transferCurrency,
    transfer_amount: input.transferAmount,
    source_currency: input.sourceCurrency,
    transfer_method: input.transferMethod,
    reason: input.reason,
    reference: input.reference,
    fee_paid_by: 'PAYER',
    metadata: { bill_id: input.billId, app: APP },
  };
  if (input.transferMethod === 'SWIFT') body.swift_charge_option = 'PAYER';
  await client.request({ method: 'POST', path: '/transfers/validate', body });
}

export async function getTransfer(
  client: AirwallexClient,
  transferId: string,
  mode: ExecutionSummary['mode'],
): Promise<ExecutionSummary> {
  const payload = await client.request({
    method: 'GET',
    path: `/transfers/${transferId}`,
  });
  return mapTransfer(payload, mode);
}

export async function listTransfers(
  client: AirwallexClient,
  query: { requestId?: string } = {},
): Promise<unknown> {
  return client.request({
    method: 'GET',
    path: '/transfers',
    query: { request_id: query.requestId },
  });
}

export async function cancelTransfer(
  client: AirwallexClient,
  transferId: string,
): Promise<unknown> {
  return client.request({
    method: 'POST',
    path: `/transfers/${transferId}/cancel`,
  });
}
