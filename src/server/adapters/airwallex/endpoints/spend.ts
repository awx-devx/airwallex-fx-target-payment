import type { AirwallexClient } from '@/server/adapters/airwallex/client';

export interface CreateSpendBillInput {
  legalEntityId: string;
  vendorId: string;
  billingCurrency: string;
  dueDate: string;
  lineItems: unknown[];
  requestId: string;
}

export async function getAccount(client: AirwallexClient): Promise<unknown> {
  client.assertSpendEnabled();
  return client.request({ method: 'GET', path: '/account' });
}

export async function createVendor(
  client: AirwallexClient,
  body: Record<string, unknown>,
): Promise<unknown> {
  client.assertSpendEnabled();
  return client.request({
    method: 'POST',
    path: '/spend/vendors/create',
    body,
  });
}

export async function createBill(
  client: AirwallexClient,
  input: CreateSpendBillInput,
): Promise<unknown> {
  client.assertSpendEnabled();
  return client.request({
    method: 'POST',
    path: '/spend/bills/create',
    body: {
      legal_entity_id: input.legalEntityId,
      vendor_id: input.vendorId,
      billing_currency: input.billingCurrency,
      due_date: input.dueDate,
      line_items: input.lineItems,
      request_id: input.requestId,
    },
  });
}

export async function markBillPaid(
  client: AirwallexClient,
  billId: string,
): Promise<unknown> {
  client.assertSpendEnabled();
  return client.request({
    method: 'POST',
    path: `/spend/bills/${billId}/mark_as_paid`,
  });
}
