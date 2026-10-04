import type { AccountVerification, BeneficiaryFormSchema, BeneficiarySummary, EntityType, TransferMethod } from '@/contracts/airwallex';
import { beneficiaryFormSchemaSchema } from '@/contracts/airwallex';
import type { Clock } from '@/server/adapters/clock';
import {
  createBeneficiary,
  getApiSchema,
  getFormSchema,
  searchBanks,
  validateBeneficiary,
  verifyAccount,
} from '@/server/adapters/airwallex/endpoints/beneficiaries';
import { AirwallexError } from '@/server/adapters/airwallex/errors';
import { buildBeneficiaryBody, readApiSchema, type BeneficiaryDraft } from '@/server/adapters/airwallex/schemaPayload';
import { Beneficiary, Bill } from '@/server/db/models';
import type { Env } from '@/server/env';
import { requireAirwallex } from '@/server/services/airwallexClient';
import { invalid, notFound, ServiceError } from '@/server/services/errors';
import { Redis } from 'ioredis';

const VERIFY_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV',
  'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH', 'GB', 'VN',
]);

export interface BeneficiaryRequest {
  name: string;
  entityType: EntityType;
  bankCountry: string;
  accountCurrency: string;
  transferMethod: TransferMethod;
  iban?: string;
  accountNumber?: string;
  bic?: string;
  localBankCode?: string;
  routingType?: string;
}

export async function resolveBeneficiary(input: {
  billId: string;
  body: BeneficiaryRequest;
  env: Env;
  clock: Clock;
}): Promise<BeneficiarySummary> {
  const bill = await Bill.findById(input.billId);
  if (!bill) throw notFound();
  if (bill.state !== 'DRAFT' && bill.state !== 'READY' && bill.state !== 'FAILED') {
    throw new ServiceError('INVALID_STATE', `${bill.state} cannot change beneficiary`, 409);
  }
  const matched = await matchExisting(input.body);
  const summary = matched ?? (await createResolved(input));
  await Bill.findOneAndUpdate(
    { _id: bill._id, state: bill.state, version: bill.version },
    { $set: { beneficiaryId: summary.id }, $inc: { version: 1 } },
  );
  return summary;
}

export async function formSchema(
  env: Env,
  condition: {
    bankCountry: string;
    accountCurrency: string;
    transferMethod: TransferMethod;
    entityType: EntityType;
  },
): Promise<BeneficiaryFormSchema> {
  const key = `bf:schema:${condition.bankCountry}:${condition.accountCurrency}:${condition.transferMethod}:${condition.entityType}`;
  if (env.PAYMENTS_GATEWAY === 'mock') {
    return beneficiaryFormSchemaSchema.parse({
      condition,
      fields: [
        {
          path: 'beneficiary.bank_details.account_name',
          key: 'account_name',
          label: 'Account name',
          type: 'INPUT',
          required: true,
          enabled: true,
          refresh: false,
        },
      ],
    });
  }
  return cached(env.REDIS_URL, key, () => getFormSchema(requireAirwallex(env), condition));
}

export async function bankSearch(
  env: Env,
  query: {
    accountCurrency: string;
    bankCountryCode: string;
    entityType: EntityType;
    transferMethod: TransferMethod;
    keyword?: string;
  },
): Promise<{ options: { label: string; routingValue: string }[]; truncated: boolean }> {
  if (env.PAYMENTS_GATEWAY === 'mock') {
    return { options: [{ label: 'Example Bank', routingValue: '000000' }], truncated: false };
  }
  return searchBanks(requireAirwallex(env), query);
}

export async function validateBeneficiaryBody(
  env: Env,
  body: Record<string, unknown>,
): Promise<{ fieldErrors: NonNullable<AirwallexError['fieldErrors']> }> {
  if (env.PAYMENTS_GATEWAY === 'mock') return { fieldErrors: [] };
  try {
    await validateBeneficiary(requireAirwallex(env), body);
    return { fieldErrors: [] };
  } catch (error) {
    if (error instanceof AirwallexError) return { fieldErrors: error.fieldErrors ?? [] };
    throw error;
  }
}

export async function verifyBeneficiaryAccount(
  env: Env,
  body: Record<string, unknown>,
  clock: Clock,
): Promise<AccountVerification> {
  const country = bankCountry(body);
  if (!country || !VERIFY_COUNTRIES.has(country)) {
    return { code: 'NOT_SUPPORTED', checkedAt: clock.now().toISOString() };
  }
  if (env.PAYMENTS_GATEWAY === 'mock') {
    return { code: 'NOT_SUPPORTED', checkedAt: clock.now().toISOString() };
  }
  return verifyAccount(requireAirwallex(env), body);
}

async function matchExisting(body: BeneficiaryRequest): Promise<BeneficiarySummary | undefined> {
  const last4 = (body.iban ?? body.accountNumber)?.replaceAll(/\s+/g, '').slice(-4);
  const docs = await Beneficiary.find({
    name: new RegExp(`^${escapeRegExp(body.name)}$`, 'i'),
    bankCountry: body.bankCountry.toUpperCase(),
    accountCurrency: body.accountCurrency.toUpperCase(),
  }).lean();
  const chosen = last4
    ? docs.find((doc) => doc.maskedAccount.endsWith(last4)) ?? docs[0]
    : docs[0];
  if (!chosen) return undefined;
  return {
    id: String(chosen._id),
    airwallexBeneficiaryId: chosen.airwallexBeneficiaryId,
    name: chosen.name,
    entityType: chosen.entityType,
    bankCountry: chosen.bankCountry,
    accountCurrency: chosen.accountCurrency,
    maskedAccount: chosen.maskedAccount,
    transferMethods: chosen.transferMethods,
    ...(chosen.bankName ? { bankName: chosen.bankName } : {}),
    ...(chosen.verification
      ? {
          verification: {
            code: chosen.verification.code,
            checkedAt: chosen.verification.checkedAt.toISOString(),
            ...(chosen.verification.nameMatch ? { nameMatch: chosen.verification.nameMatch } : {}),
            ...(chosen.verification.resolvedAccountName
              ? { resolvedAccountName: chosen.verification.resolvedAccountName }
              : {}),
          },
        }
      : {}),
  };
}

async function createResolved(input: {
  billId: string;
  body: BeneficiaryRequest;
  env: Env;
  clock: Clock;
}): Promise<BeneficiarySummary> {
  const account = (input.body.iban ?? input.body.accountNumber ?? '').replaceAll(/\s+/g, '');
  if (account.length < 4) throw invalid('An IBAN or account number is required');
  if (input.env.PAYMENTS_GATEWAY === 'mock') {
    const created = await Beneficiary.create({
      airwallexBeneficiaryId: `mock:${input.billId}`,
      name: input.body.name,
      entityType: input.body.entityType,
      bankCountry: input.body.bankCountry.toUpperCase(),
      accountCurrency: input.body.accountCurrency.toUpperCase(),
      maskedAccount: `••••${account.slice(-4)}`,
      transferMethods: [input.body.transferMethod],
      verification: { code: 'NOT_SUPPORTED', checkedAt: input.clock.now() },
    });
    const matched = await matchExisting(input.body);
    if (!matched) throw new Error('beneficiary was not stored');
    void created;
    return matched;
  }
  const client = requireAirwallex(input.env);
  const draft = toDraft(input.body);
  const schema = readApiSchema(
    await getApiSchema(client, {
      bankCountry: draft.country,
      accountCurrency: draft.currency,
      transferMethod: draft.transferMethod,
      entityType: input.body.entityType,
    }),
  );
  const payload = buildBeneficiaryBody(schema, draft);
  try {
    await validateBeneficiary(client, payload);
  } catch (error) {
    if (error instanceof AirwallexError) {
      throw new ServiceError('VALIDATION_FAILED', error.message, 400, error.fieldErrors);
    }
    throw error;
  }
  const mapped = await createBeneficiary(client, { billId: input.billId, body: payload });
  const verification = VERIFY_COUNTRIES.has(draft.country)
    ? await verifyAccount(client, payload)
    : { code: 'NOT_SUPPORTED' as const, checkedAt: input.clock.now().toISOString() };
  const created = await Beneficiary.create({
    airwallexBeneficiaryId: mapped.airwallexBeneficiaryId,
    name: mapped.name,
    entityType: mapped.entityType,
    bankCountry: mapped.bankCountry,
    accountCurrency: mapped.accountCurrency,
    ...(mapped.bankName ? { bankName: mapped.bankName } : {}),
    maskedAccount: mapped.maskedAccount,
    transferMethods: mapped.transferMethods,
    verification: {
      code: verification.code,
      checkedAt: input.clock.now(),
      ...(verification.nameMatch ? { nameMatch: verification.nameMatch } : {}),
      ...(verification.resolvedAccountName ? { resolvedAccountName: verification.resolvedAccountName } : {}),
    },
  });
  return {
    id: String(created._id),
    airwallexBeneficiaryId: mapped.airwallexBeneficiaryId,
    name: mapped.name,
    entityType: input.body.entityType,
    bankCountry: mapped.bankCountry,
    accountCurrency: mapped.accountCurrency,
    maskedAccount: mapped.maskedAccount,
    transferMethods: mapped.transferMethods.filter(
      (method): method is TransferMethod => method === 'LOCAL' || method === 'SWIFT',
    ),
    ...(mapped.bankName ? { bankName: mapped.bankName } : {}),
    verification,
  };
}

function toDraft(body: BeneficiaryRequest): BeneficiaryDraft {
  return {
    companyName: body.name,
    country: body.bankCountry.toUpperCase(),
    currency: body.accountCurrency.toUpperCase(),
    city: 'NA',
    state: 'NA',
    postcode: '00000',
    street: 'NA',
    transferMethod: body.transferMethod,
    ...(body.iban ? { iban: body.iban.replaceAll(/\s+/g, '') } : {}),
    ...(body.bic ? { bic: body.bic } : {}),
    ...(body.accountNumber ? { accountNumber: body.accountNumber } : {}),
    ...(body.routingType ? { routingType1: body.routingType } : {}),
    ...(body.localBankCode ? { routingValue1: body.localBankCode } : {}),
  };
}

function bankCountry(body: Record<string, unknown>): string | undefined {
  const beneficiary = record(body.beneficiary);
  const bank = record(beneficiary?.bank_details);
  const code = bank?.bank_country_code ?? body.bankCountry;
  return typeof code === 'string' ? code.toUpperCase() : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let redis: Redis | undefined;

async function cached<T>(url: string, key: string, load: () => Promise<T>): Promise<T> {
  redis ??= new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  if (redis.status === 'wait') await redis.connect();
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit) as T;
  const value = await load();
  await redis.set(key, JSON.stringify(value), 'EX', 86_400);
  return value;
}

export async function closeBeneficiaryCache(): Promise<void> {
  const current = redis;
  redis = undefined;
  if (current) await current.quit();
}
