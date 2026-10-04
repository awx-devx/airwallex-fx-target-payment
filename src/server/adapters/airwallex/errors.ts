import type { ApiError, ApiErrorCode, FieldError } from '@/contracts/airwallex';
import {
  fieldErrorMessage,
  type FieldErrorParams,
} from '@/contracts/airwallex-errors';
import { isRecord } from '@/server/adapters/airwallex/values';

/**
 * Same condition, different spellings per endpoint (docs/13 §2.1).
 * The canonical code is what control flow matches on.
 */
const CODE_ALIASES: Record<string, string> = {
  expired_quote: 'quote_expired',
  invalid_quote_id: 'quote_id_invalid',
  request_id_duplicate: 'duplicate_request_id',
  insufficient_funds: 'balance_insufficient',
};

const API_CODES: Record<string, ApiErrorCode> = {
  validation_failed: 'VALIDATION_FAILED',
  quote_expired: 'QUOTE_EXPIRED',
  quote_id_invalid: 'QUOTE_INVALID',
  conflict_original_ccy: 'QUOTE_INVALID',
  quote_id_required: 'AIRWALLEX_CONFIG',
  balance_insufficient: 'INSUFFICIENT_BALANCE',
  open_position_limit_exceeded: 'INSUFFICIENT_BALANCE',
  credit_limit_exceeded: 'INSUFFICIENT_BALANCE',
  amount_above_limit: 'AMOUNT_LIMIT',
  amount_below_limit: 'AMOUNT_LIMIT',
  amount_beneficiary_receives_below_limit: 'AMOUNT_LIMIT',
  amount_beneficiary_receives_above_cumulative_limit: 'AMOUNT_LIMIT',
  unsupported_currency: 'ROUTE_UNSUPPORTED',
  transfer_currency_unsupported: 'ROUTE_UNSUPPORTED',
  source_currency_unsupported: 'ROUTE_UNSUPPORTED',
  currency_pair_invalid: 'ROUTE_UNSUPPORTED',
  transfer_method_unsupported: 'ROUTE_UNSUPPORTED',
  payout_method_unsupported: 'ROUTE_UNSUPPORTED',
  beneficiary_type_unsupported: 'ROUTE_UNSUPPORTED',
  transfer_date_invalid: 'DATE_INVALID',
  invalid_settlement_date: 'DATE_INVALID',
  invalid_conversion_date: 'DATE_INVALID',
  declaration_required: 'CORRIDOR_REQUIREMENT',
  order_amount_insufficient: 'CORRIDOR_REQUIREMENT',
  order_reconciliation_failed: 'CORRIDOR_REQUIREMENT',
  order_info_unsupported: 'CORRIDOR_REQUIREMENT',
  update_unsupported: 'TRANSFER_NOT_CANCELLABLE',
  transfer_not_found: 'NOT_FOUND',
  not_found: 'NOT_FOUND',
  credentials_invalid: 'AIRWALLEX_ERROR',
  credentials_expired: 'AIRWALLEX_ERROR',
  credentials_missing: 'AIRWALLEX_CONFIG',
  forbidden: 'AIRWALLEX_CONFIG',
  fee_unknown: 'AIRWALLEX_CONFIG',
  workflow_invalid: 'AIRWALLEX_CONFIG',
  term_agreement_is_required: 'AIRWALLEX_CONFIG',
  incorrect_version: 'AIRWALLEX_CONFIG',
  feature_disabled: 'AIRWALLEX_CONFIG',
  simulation_unavailable: 'AIRWALLEX_CONFIG',
  service_unavailable: 'AIRWALLEX_UNAVAILABLE',
  operation_failed: 'AIRWALLEX_UNAVAILABLE',
  network_error: 'AIRWALLEX_UNAVAILABLE',
  invalid_response: 'AIRWALLEX_ERROR',
};

export function canonicalAirwallexCode(code: string): string {
  return CODE_ALIASES[code] ?? code;
}

export class AirwallexError extends Error {
  readonly status: number;
  /** Alias-collapsed code (`expired_quote` → `quote_expired`). */
  readonly code: string;
  /** Code as Airwallex sent it. */
  readonly providerCode: string;
  readonly source?: string;
  readonly details?: unknown;
  readonly fieldErrors?: FieldError[];
  readonly traceId?: string;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    source?: string;
    details?: unknown;
    fieldErrors?: FieldError[];
    traceId?: string;
    providerCode?: string;
  }) {
    super(init.message);
    this.name = 'AirwallexError';
    this.status = init.status;
    this.providerCode = init.providerCode ?? init.code;
    this.code = canonicalAirwallexCode(this.providerCode);
    this.source = init.source;
    this.details = init.details;
    this.fieldErrors = init.fieldErrors;
    this.traceId = init.traceId;
  }
}

export function isDuplicateRequest(error: AirwallexError): boolean {
  return error.code === 'duplicate_request_id';
}

export function isRequestPending(error: AirwallexError): boolean {
  return error.code === 'request_pending';
}

/** `details.id` on a duplicate create: the transfer that already exists. */
export function duplicateResourceId(error: AirwallexError): string | undefined {
  if (!isRecord(error.details)) return undefined;
  const id = error.details.id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

export function airwallexErrorFromBody(
  status: number,
  body: unknown,
  traceId?: string,
): AirwallexError {
  if (!isRecord(body)) {
    return new AirwallexError({
      status,
      code: status >= 500 ? 'service_unavailable' : 'unknown',
      message: 'Airwallex request failed',
      traceId,
    });
  }
  const providerCode = typeof body.code === 'string' ? body.code : 'unknown';
  const message =
    typeof body.message === 'string'
      ? body.message
      : 'Airwallex request failed';
  const source = typeof body.source === 'string' ? body.source : undefined;
  const fieldErrors =
    canonicalAirwallexCode(providerCode) === 'validation_failed'
      ? fieldErrorsFrom(body.details)
      : undefined;
  return new AirwallexError({
    status,
    code: providerCode,
    providerCode,
    message,
    source,
    details: body.details,
    fieldErrors,
    traceId,
  });
}

/**
 * Maps a provider error onto our API envelope.
 * `duplicate_request_id` and `request_pending` are not API errors: the caller
 * continues the existing transfer or retries the same `request_id`.
 */
export function toApiError(error: AirwallexError): ApiError {
  if (isDuplicateRequest(error) || isRequestPending(error)) {
    throw new Error(`${error.code} is not an ApiError`);
  }
  const api: ApiError = {
    code: apiCode(error),
    message: error.message,
    airwallex: {
      code: error.providerCode,
      ...(error.source ? { source: error.source } : {}),
    },
  };
  if (error.fieldErrors && error.fieldErrors.length > 0) {
    api.fieldErrors = error.fieldErrors;
  }
  if (error.details !== undefined) api.details = error.details;
  return api;
}

function apiCode(error: AirwallexError): ApiErrorCode {
  const exact = API_CODES[error.code];
  if (exact) return exact;
  if (isAmountLimit(error.code)) return 'AMOUNT_LIMIT';
  if (error.status === 429) return 'RATE_LIMITED';
  if (error.status >= 500) return 'AIRWALLEX_UNAVAILABLE';
  if (error.status === 401) return 'AIRWALLEX_ERROR';
  if (error.status === 403) return 'AIRWALLEX_CONFIG';
  if (error.status === 404) return 'NOT_FOUND';
  return 'AIRWALLEX_ERROR';
}

function isAmountLimit(code: string): boolean {
  return (
    code.endsWith('_above_account_limit') ||
    code.endsWith('_below_account_limit') ||
    (code.startsWith('amount_') && code.endsWith('_transfer_method_limit'))
  );
}

function fieldErrorsFrom(details: unknown): FieldError[] {
  if (!isRecord(details) || !Array.isArray(details.errors)) return [];
  const errors: FieldError[] = [];
  for (const entry of details.errors) {
    if (!isRecord(entry)) continue;
    const path = typeof entry.source === 'string' ? entry.source : '';
    const code = typeof entry.code === 'string' ? entry.code : '';
    if (path.length === 0 || code.length === 0) continue;
    const params = fieldParams(entry.params);
    const providerMessage =
      typeof entry.message === 'string' ? entry.message : undefined;
    errors.push({
      path,
      code,
      message: fieldErrorMessage(code, params, providerMessage),
      ...(params ? { params } : {}),
    });
  }
  return errors;
}

function fieldParams(value: unknown): FieldErrorParams | undefined {
  if (!isRecord(value)) return undefined;
  const params: FieldErrorParams = {};
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' || typeof child === 'number')
      params[key] = child;
  }
  return Object.keys(params).length > 0 ? params : undefined;
}
