import type {
  AccountVerification,
  BeneficiaryFormSchema,
  EntityType,
  TransferMethod,
} from '@/contracts/airwallex';
import type { AirwallexClient } from '@/server/adapters/airwallex/client';
import {
  mapBankOptions,
  mapBeneficiary,
  mapFormSchema,
  mapVerification,
  type MappedBeneficiary,
} from '@/server/adapters/airwallex/mappers';
import { beneficiaryRequestId } from '@/server/adapters/airwallex/requestIds';

export interface BeneficiaryCondition {
  bankCountry: string;
  accountCurrency: string;
  transferMethod: TransferMethod;
  entityType: EntityType;
  countryCode?: string;
}

export async function createBeneficiary(
  client: AirwallexClient,
  input: { billId: string; body: Record<string, unknown> },
): Promise<MappedBeneficiary> {
  const payload = await client.request({
    method: 'POST',
    path: '/beneficiaries/create',
    body: { ...input.body, request_id: beneficiaryRequestId(input.billId) },
  });
  return mapBeneficiary(payload);
}

export async function getBeneficiary(
  client: AirwallexClient,
  beneficiaryId: string,
): Promise<MappedBeneficiary> {
  const payload = await client.request({
    method: 'GET',
    path: `/beneficiaries/${beneficiaryId}`,
  });
  return mapBeneficiary(payload);
}

export async function listBeneficiaries(
  client: AirwallexClient,
  query?: Record<string, string>,
): Promise<unknown> {
  return client.request({ method: 'GET', path: '/beneficiaries', query });
}

export async function validateBeneficiary(
  client: AirwallexClient,
  body: Record<string, unknown>,
): Promise<void> {
  await client.request({
    method: 'POST',
    path: '/beneficiaries/validate',
    body,
  });
}

export async function verifyAccount(
  client: AirwallexClient,
  body: Record<string, unknown>,
): Promise<AccountVerification> {
  const payload = await client.request({
    method: 'POST',
    path: '/beneficiaries/verify_account',
    body,
  });
  return mapVerification(payload, client.clock.now().toISOString());
}

export async function getApiSchema(
  client: AirwallexClient,
  condition: BeneficiaryCondition,
): Promise<unknown> {
  return client.request({
    method: 'POST',
    path: '/beneficiary_api_schemas/generate',
    body: conditionBody(condition),
  });
}

export async function getFormSchema(
  client: AirwallexClient,
  condition: BeneficiaryCondition,
): Promise<BeneficiaryFormSchema> {
  const payload = await client.request({
    method: 'POST',
    path: '/beneficiary_form_schemas/generate',
    body: conditionBody(condition),
  });
  return mapFormSchema(payload, {
    bankCountry: condition.bankCountry,
    accountCurrency: condition.accountCurrency,
    transferMethod: condition.transferMethod,
    entityType: condition.entityType,
  });
}

export async function searchBanks(
  client: AirwallexClient,
  query: {
    accountCurrency: string;
    bankCountryCode: string;
    entityType: EntityType;
    transferMethod: TransferMethod;
    keyword?: string;
    bankIdentifier?: string;
  },
): Promise<{
  options: { label: string; routingValue: string }[];
  truncated: boolean;
}> {
  const payload = await client.request({
    method: 'GET',
    path: '/beneficiary_form_schemas/supported_financial_institutions',
    query: {
      account_currency: query.accountCurrency,
      bank_country_code: query.bankCountryCode,
      entity_type: query.entityType,
      transfer_method: query.transferMethod,
      keyword: query.keyword,
      bank_identifier: query.bankIdentifier,
    },
  });
  return mapBankOptions(payload);
}

function conditionBody(
  condition: BeneficiaryCondition,
): Record<string, string> {
  return {
    bank_country_code: condition.bankCountry,
    account_currency: condition.accountCurrency,
    transfer_method: condition.transferMethod,
    entity_type: condition.entityType,
    ...(condition.countryCode ? { country_code: condition.countryCode } : {}),
  };
}
