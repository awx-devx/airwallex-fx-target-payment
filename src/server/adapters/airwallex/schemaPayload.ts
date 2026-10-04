import { isRecord } from '@/server/adapters/airwallex/values';

export interface ApiSchemaField {
  key: string;
  path: string;
  required: boolean;
  pattern?: string;
}

export interface BeneficiaryDraft {
  companyName: string;
  country: string;
  currency: string;
  city: string;
  state: string;
  postcode: string;
  street: string;
  transferMethod: 'LOCAL' | 'SWIFT';
  iban?: string;
  bic?: string;
  accountNumber?: string;
  routingType1?: string;
  routingValue1?: string;
  bankName?: string;
  phone?: string;
}

/** Fields from `POST /beneficiary_api_schemas/generate`. */
export function readApiSchema(payload: unknown): ApiSchemaField[] {
  if (!isRecord(payload) || !Array.isArray(payload.fields)) {
    throw new Error('Beneficiary API schema has no fields');
  }
  return payload.fields.map((field) => {
    if (!isRecord(field) || typeof field.path !== 'string' || typeof field.key !== 'string') {
      throw new Error('Beneficiary API schema field is missing key or path');
    }
    const rule = isRecord(field.rule) ? field.rule : undefined;
    const pattern = typeof rule?.pattern === 'string' ? rule.pattern : undefined;
    return {
      key: field.key,
      path: field.path,
      required: field.required === true,
      ...(pattern ? { pattern } : {}),
    };
  });
}

/**
 * Fills a create/validate body from the schema. Required fields we cannot
 * fill are left out so `beneficiaries/validate` reports them.
 */
export function buildBeneficiaryBody(
  fields: ApiSchemaField[],
  draft: BeneficiaryDraft,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    const value = valueFor(field, draft);
    if (value === undefined) continue;
    if (!field.required && !draftValue(field.key, draft)) continue;
    setPath(body, field.path, value);
  }
  body.transfer_methods = [draft.transferMethod];
  const beneficiary = isRecord(body.beneficiary) ? body.beneficiary : {};
  beneficiary.type = 'BANK_ACCOUNT';
  body.beneficiary = beneficiary;
  return body;
}

function valueFor(field: ApiSchemaField, draft: BeneficiaryDraft): string | undefined {
  const fromDraft = draftValue(field.key, draft);
  if (fromDraft) return fromDraft;
  return choosePattern(field.pattern, draft.transferMethod);
}

function draftValue(key: string, draft: BeneficiaryDraft): string | undefined {
  switch (key) {
    case 'entity_type':
      return 'COMPANY';
    case 'type':
      return 'BANK_ACCOUNT';
    case 'company_name':
    case 'account_name':
    case 'nickname':
      return draft.companyName;
    case 'bank_country_code':
    case 'country_code':
      return draft.country;
    case 'account_currency':
      return draft.currency;
    case 'street_address':
      return draft.street;
    case 'city':
      return draft.city;
    case 'state':
      return draft.state;
    case 'postcode':
      return draft.postcode;
    case 'iban':
      return draft.iban;
    case 'swift_code':
    case 'bic_swift':
    case 'bank_identifier':
      return draft.bic;
    case 'account_number':
      return draft.accountNumber;
    case 'business_phone_number':
    case 'phone_number':
      return draft.phone;
    case 'account_routing_type1':
      return draft.routingType1;
    case 'account_routing_value1':
      return draft.routingValue1;
    case 'bank_name':
      return draft.bankName;
    case 'transfer_method':
      return draft.transferMethod;
    default:
      return undefined;
  }
}

function choosePattern(pattern: string | undefined, preferred: string): string | undefined {
  if (!pattern) return undefined;
  const exact = pattern.match(/^\^([A-Za-z0-9_]+)\$$/);
  if (exact?.[1]) return exact[1];
  if (!/^[A-Za-z0-9_|]+$/.test(pattern)) return undefined;
  const options = pattern.split('|');
  if (options.includes(preferred)) return preferred;
  return options[0];
}

function setPath(root: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split('.').filter((part) => part.length > 0);
  let cursor: Record<string, unknown> = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index] ?? '';
    const next = cursor[key];
    if (!isRecord(next)) {
      const created: Record<string, unknown> = {};
      cursor[key] = created;
      cursor = created;
    } else {
      cursor = next;
    }
  }
  const leaf = parts[parts.length - 1];
  if (leaf) cursor[leaf] = value;
}
