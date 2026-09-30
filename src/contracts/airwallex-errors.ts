import type { FailureCategory } from '@/contracts/airwallex';

/**
 * Short form copy for Airwallex field codes `001`–`102`.
 * Codes outside the groups in docs/13 §2.2 fall back to the Airwallex message.
 * https://www.airwallex.com/docs/payouts/errors/transfer-error-codes
 */

export type FieldErrorParams = Record<string, string | number>;

const INTERNAL_CODES = new Set(['023', '044', '045', '046', '047', '048', '050']);

type MessageFn = (params: FieldErrorParams) => string;

function fill(template: string, params: FieldErrorParams): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined ? '' : String(value);
  });
}

function exact(message: string): MessageFn {
  return () => message;
}

function template(message: string, fallback: string): MessageFn {
  return (params) => {
    if (Object.keys(params).length === 0) return fallback;
    return fill(message, params).replace(/\s+/g, ' ').trim();
  };
}

const MESSAGES: Record<string, MessageFn> = {
  '001': exact('Required'),
  '002': exact('Only letters, numbers and basic punctuation'),
  '003': exact('Only letters, numbers and spaces'),
  '004': exact('Only letters and numbers'),
  '005': exact('Only letters, numbers, dots and dashes'),
  '006': exact('Only Chinese characters and punctuation'),
  '007': exact('Only Chinese characters'),
  '008': exact('Numbers only'),
  '009': exact('Cannot be only numbers'),
  '010': exact('Invalid value'),
  '011': exact('Invalid format'),
  '012': exact('No leading or trailing spaces'),
  '013': exact("Spaces aren't allowed"),
  '014': exact("Emoji aren't allowed"),
  '015': exact('Must be a positive number'),
  '016': template(
    'Must be one of {value_options}',
    'Must be one of the allowed values',
  ),
  '017': template('Must be {value}', 'Must be the allowed value'),
  '018': template(
    '{length_min}–{length_max} characters',
    'Length is outside the allowed range',
  ),
  '019': template('Must be {length} characters', 'Length is outside the allowed range'),
  '020': template('At least {length_min} characters', 'Too short'),
  '021': template('At most {length_max} characters', 'Too long'),
  '022': template(
    'Length must be one of {length_options}',
    'Length is outside the allowed range',
  ),
  '023': exact('Too many metadata keys'),
  '024': exact("Local clearing doesn't apply to SWIFT"),
  '025': exact('Use an ISO date and time'),
  '026': exact('Use an ISO date'),
  '027': exact('Use a date from today'),
  '028': exact("PO boxes aren't accepted"),
  '029': exact('Enter a valid email'),
  '030': exact('Enter a valid postcode'),
  '031': exact("This bank can't receive this currency via this method"),
  '032': exact("SWIFT code doesn't match the bank country"),
  '033': exact('SWIFT code is invalid'),
  '035': exact('Bank or branch code not recognised'),
  '036': exact("IBAN doesn't match the bank country"),
  '037': template(
    'Max {amount_max} {amount_max_currency}',
    'Amount is above the limit',
  ),
  '038': template(
    'Min {amount_min} {amount_min_currency}',
    'Amount is below the limit',
  ),
  '039': exact('Account number not valid for this bank'),
  '040': exact("This bank can't receive this currency via this method"),
  '042': template('Max {decimal_max} decimals', 'Too many decimal places'),
  '043': exact("This bank can't receive this currency via this method"),
  '044': exact('This field could not be validated'),
  '045': exact('This field could not be validated'),
  '046': exact('This field could not be validated'),
  '047': exact('This field could not be validated'),
  '048': exact('This field could not be validated'),
  '050': exact('This field could not be validated'),
  '082': exact('Bank or branch code not recognised'),
  '085': exact('Account number not valid for this bank'),
  '086': exact('Bank or branch code not recognised'),
  '087': exact('Bank or branch code not recognised'),
  '088': exact('Bank or branch code not recognised'),
  '090': exact('Cannot be only spaces'),
  '091': exact('Provide an IBAN or local account details'),
  '092': exact('Enter a valid phone number'),
  '099': template('Phone country code must be {country_code}', 'Enter a valid phone number'),
  '100': template(
    'Phone number must be {length_min}–{length_max} digits',
    'Enter a valid phone number',
  ),
  '101': template('Between {min} and {max}', 'Outside the allowed range'),
};

export function isInternalFieldError(code: string): boolean {
  return INTERNAL_CODES.has(code);
}

/**
 * UI copy for a field-validation code. Unknown codes return `airwallexMessage`
 * when it is present.
 */
export function fieldErrorMessage(
  code: string,
  params?: FieldErrorParams,
  airwallexMessage?: string,
): string {
  const known = MESSAGES[code];
  if (!known) {
    return airwallexMessage && airwallexMessage.length > 0
      ? airwallexMessage
      : `Validation error ${code}`;
  }
  const normalised: FieldErrorParams = { ...params };
  if (normalised.values !== undefined && normalised.value_options === undefined) {
    normalised.value_options = normalised.values;
  }
  if (normalised.decimals !== undefined && normalised.decimal_max === undefined) {
    normalised.decimal_max = normalised.decimals;
  }
  return known(normalised);
}

const FAILURE_TYPES: Record<string, FailureCategory> = {
  INVALID_ACCOUNT_NAME_OR_NUMBER: 'BENEFICIARY_DETAILS',
  INVALID_BANK_INFORMATION: 'BENEFICIARY_DETAILS',
  INVALID_BANK_OR_BRANCH_CODE: 'BENEFICIARY_DETAILS',
  INVALID_BENEFICIARY_DETAILS: 'BENEFICIARY_DETAILS',
  INVALID_SWIFT_BIC_CODE: 'BENEFICIARY_DETAILS',
  INVALID_CORRESPONDENT_BANK_INFORMATION: 'BENEFICIARY_DETAILS',
  BENEFICIARY_NAME_MISMATCH: 'BENEFICIARY_DETAILS',
  INVALID_SPECIAL_CHARACTER: 'BENEFICIARY_DETAILS',
  ACCOUNT_CURRENCY_MISMATCH: 'BENEFICIARY_DETAILS',
  ACCOUNT_CLOSED: 'ACCOUNT',
  ACCOUNT_INACTIVE_OR_DORMANT: 'ACCOUNT',
  ACCOUNT_UNDER_RESTRICTION: 'ACCOUNT',
  BENEFICIARY_BANK_RETURNED: 'RETURNED',
  BENEFICIARY_REQUESTED: 'RETURNED',
  RECALL_REQUESTED: 'RETURNED',
  DUPLICATION_RETURN: 'RETURNED',
  INSUFFICIENT_FUNDS: 'FUNDS_OR_LIMITS',
  EXCEEDED_TRANSACTION_AMOUNT_OR_LIMIT: 'FUNDS_OR_LIMITS',
  TRANSACTION_AMOUNT_NOT_COVERING_FEE: 'FUNDS_OR_LIMITS',
  TM_SUSPENDED: 'COMPLIANCE',
  // The retrieve example uses this shorter token for the same suspension.
  TM_SUSPEND: 'COMPLIANCE',
  INVALID_PAYMENT_PURPOSE: 'COMPLIANCE',
  CHANNEL_POLICY: 'COMPLIANCE',
  CLIENT_REQUESTED: 'CLIENT',
  SYSTEM_ERROR: 'SYSTEM',
  CHANNEL_TIMEOUT: 'SYSTEM',
  CARD_ISSUER_ERROR: 'SYSTEM',
  UNABLE_TO_APPLY: 'SYSTEM',
  OTHER: 'SYSTEM',
};

export const FAILURE_NEXT_STEP: Record<FailureCategory, string> = {
  BENEFICIARY_DETAILS: "Fix the vendor's bank details",
  ACCOUNT: "Vendor account can't receive funds, so contact the vendor",
  RETURNED: "Returned by the vendor's bank",
  FUNDS_OR_LIMITS: 'Top up or reduce the amount',
  COMPLIANCE: 'Held for compliance review',
  CLIENT: 'Cancelled at your request',
  SYSTEM: "Airwallex couldn't process it, so retry",
};

export interface FailureHint {
  code?: string;
  reasonCodes?: string[];
  /** `failure.details.type`, or a simulation `failure_type`. */
  type?: string;
}

function categoryOf(token: string | undefined): FailureCategory | undefined {
  if (!token) return undefined;
  if (token.startsWith('INBOUND_')) return 'SYSTEM';
  return FAILURE_TYPES[token];
}

/**
 * Group a transfer failure for the ticket's next step.
 * Matches `details.type`, then `reason_codes`, then `code`, else `SYSTEM`.
 */
export function failureCategory(failure: string | FailureHint): FailureCategory {
  if (typeof failure === 'string') return categoryOf(failure) ?? 'SYSTEM';
  const fromType = categoryOf(failure.type);
  if (fromType) return fromType;
  for (const reason of failure.reasonCodes ?? []) {
    const match = categoryOf(reason);
    if (match) return match;
  }
  return categoryOf(failure.code) ?? 'SYSTEM';
}
