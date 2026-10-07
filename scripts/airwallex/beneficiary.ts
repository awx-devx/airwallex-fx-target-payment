import type { AirwallexClient } from '@/server/adapters/airwallex/client';
import { AirwallexError } from '@/server/adapters/airwallex/errors';
import { searchBanks } from '@/server/adapters/airwallex/endpoints/beneficiaries';
import { beneficiaryRequestId } from '@/server/adapters/airwallex/requestIds';
import {
  buildBeneficiaryBody,
  readApiSchema,
  type BeneficiaryDraft,
} from '@/server/adapters/airwallex/schemaPayload';
import { isRecord } from '@/server/adapters/airwallex/values';

export interface EnsuredBeneficiary {
  id: string;
  requestId: string;
  body: Record<string, unknown>;
  created: unknown;
  schema: unknown;
}

export async function ensureBeneficiary(
  client: AirwallexClient,
  draft: BeneficiaryDraft,
  requestKey: string,
  keyword?: string,
): Promise<EnsuredBeneficiary> {
  const schema = await client.request({
    method: 'POST',
    path: '/beneficiary_api_schemas/generate',
    body: {
      bank_country_code: draft.country,
      account_currency: draft.currency,
      transfer_method: draft.transferMethod,
      entity_type: 'COMPANY',
      type: 'BANK_ACCOUNT',
    },
  });
  const fields = readApiSchema(schema);
  if (keyword) {
    const banks = await searchBanks(client, {
      accountCurrency: draft.currency,
      bankCountryCode: draft.country,
      entityType: 'COMPANY',
      transferMethod: draft.transferMethod,
      keyword,
    });
    const first = banks.options[0];
    if (first) applyInstitution(draft, first.label, first.routingValue);
  }
  const body = buildBeneficiaryBody(fields, draft);
  // AIRWALLEX: POST /beneficiaries/create has no request_id. This key is only
  // a fixture label. The app dedupes with matchExisting before create.
  const requestId = beneficiaryRequestId(requestKey);
  try {
    await client.request({
      method: 'POST',
      path: '/beneficiaries/validate',
      body,
    });
  } catch (error) {
    if (!(error instanceof AirwallexError)) throw error;
    const fieldsText = error.fieldErrors
      ?.map((field) => `${field.path}:${field.code}`)
      .join(', ');
    throw new Error(
      `validate ${draft.currency} ${draft.transferMethod} failed: ${error.providerCode} ${error.message}${fieldsText ? ` [${fieldsText}]` : ''}`,
    );
  }
  const created = await client.request({
    method: 'POST',
    path: '/beneficiaries/create',
    body,
  });
  return { id: resourceId(created), requestId, body, created, schema };
}

const SWIFT = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

function applyInstitution(
  draft: BeneficiaryDraft,
  label: string,
  value: string,
): void {
  draft.bankName = label;
  if (SWIFT.test(value)) draft.bic = value;
  else draft.routingValue1 = value;
}

function resourceId(payload: unknown): string {
  if (
    isRecord(payload) &&
    typeof payload.id === 'string' &&
    payload.id.length > 0
  ) {
    return payload.id;
  }
  throw new Error('Beneficiary response has no id');
}
