import { z } from 'zod';
import Decimal from 'decimal.js';
import {
  accountVerificationSchema,
  balanceSummarySchema,
  beneficiaryFormSchemaSchema,
  corridorQuotaSchema,
  executionSummarySchema,
  nonConversionDaySchema,
  quoteSummarySchema,
  type AccountVerification,
  type BalanceSummary,
  type BankOption,
  type BeneficiaryFormSchema,
  type CorridorQuota,
  type ExecutionSummary,
  type FormSchemaField,
  type NonConversionDay,
  type QuoteSummary,
} from '@/contracts/airwallex';
import { failureCategory } from '@/contracts/airwallex-errors';
import { D, significantPrice } from '@/contracts/money';
import { AirwallexError } from '@/server/adapters/airwallex/errors';
import { toIsoUtc } from '@/server/adapters/airwallex/time';
import {
  decimalField,
  isRecord,
  optionalDecimal,
  optionalString,
  requiredString,
} from '@/server/adapters/airwallex/values';

const APPROVAL_STATUSES = new Set([
  'IN_APPROVAL',
  'APPROVAL_RECALLED',
  'APPROVAL_REJECTED',
  'APPROVAL_BLOCKED',
]);

const LATE_FAILURE_MS = 72 * 60 * 60 * 1000;

export interface MappedRate {
  price: string;
  ts: string;
  conversionDate?: string;
  currencyPair?: string;
  dealtCurrency: string;
}

export interface BalanceHistoryItem {
  amount: string;
  balance: string;
  currency: string;
  source?: string;
  sourceType?: string;
  transactionType?: string;
  postedAt: string;
}

export interface BalanceHistoryPage {
  items: BalanceHistoryItem[];
  pageAfter?: string;
}

export interface SupportedCurrencies {
  buy: string[];
  sell: string[];
}

export interface MappedBeneficiary {
  airwallexBeneficiaryId: string;
  name: string;
  entityType: string;
  bankCountry: string;
  accountCurrency: string;
  bankName?: string;
  maskedAccount: string;
  transferMethods: string[];
}

/**
 * Market-convention rate → canonical orientation (H per 1 F).
 * `rate` when `currency_pair` is F+H, `1/rate` when it is H+F.
 */
export function orient(
  rate: string,
  currencyPair: string,
  base: string,
  quote: string,
): string {
  const value = D(rate);
  if (currencyPair === `${base}${quote}`) return significantPrice(value);
  if (currencyPair === `${quote}${base}`) {
    if (value.isZero()) bad('rate is zero');
    return significantPrice(new Decimal(1).div(value));
  }
  bad(`currency_pair ${currencyPair} does not match ${base}/${quote}`);
}

export function mapCurrentRate(
  payload: unknown,
  buyCurrency: string,
): MappedRate {
  if (!isRecord(payload)) bad('rate response is not an object');
  if (!Array.isArray(payload.rate_details))
    bad('rate response has no rate_details');
  const client = payload.rate_details.find(
    (entry) => isRecord(entry) && entry.level === 'CLIENT',
  );
  if (!isRecord(client)) bad('rate response has no CLIENT level');
  const sell = decimalField(client, 'sell_amount');
  const buy = decimalField(client, 'buy_amount');
  if (D(buy).isZero()) bad('CLIENT buy_amount is zero');
  const dealt = requiredString(payload, 'dealt_currency');
  if (dealt !== buyCurrency) {
    bad(`dealt_currency ${dealt} does not match ${buyCurrency}`);
  }
  return {
    price: significantPrice(D(sell).div(D(buy))),
    ts: toIsoUtc(requiredString(payload, 'created_at')),
    conversionDate: optionalString(payload, 'conversion_date'),
    currencyPair: optionalString(payload, 'currency_pair'),
    dealtCurrency: dealt,
  };
}

export function mapQuote(payload: unknown): QuoteSummary {
  if (!isRecord(payload)) bad('quote response is not an object');
  const sellAmount = decimalField(payload, 'sell_amount');
  const buyAmount = decimalField(payload, 'buy_amount');
  if (D(buyAmount).isZero()) bad('buy_amount is zero');
  const buy = requiredString(payload, 'buy_currency');
  const sell = requiredString(payload, 'sell_currency');
  const pair = requiredString(payload, 'currency_pair');
  const clientRate = decimalField(payload, 'client_rate');
  const midRate = optionalDecimal(payload, 'mid_rate');
  const midPrice =
    midRate === undefined ? undefined : orient(midRate, pair, buy, sell);
  const price = significantPrice(D(sellAmount).div(D(buyAmount)));
  const bps =
    midPrice === undefined ? undefined : spreadBps(D(price), D(midPrice));
  return parseContract(
    quoteSummarySchema,
    {
      airwallexQuoteId: requiredString(payload, 'quote_id'),
      price,
      sellAmount,
      buyAmount,
      clientRate,
      clientRateOriented: orient(clientRate, pair, buy, sell),
      ...(midPrice === undefined ? {} : { midPrice }),
      ...(bps === undefined ? {} : { spreadBps: bps }),
      validity: requiredString(payload, 'validity'),
      validFromAt: toIsoUtc(requiredString(payload, 'valid_from_at')),
      validToAt: toIsoUtc(requiredString(payload, 'valid_to_at')),
      usage: requiredString(payload, 'usage'),
      conversionDate: requiredString(payload, 'conversion_date'),
    },
    'quote',
  );
}

/** Retrieve and webhook `data.object` share this mapper. `mode` is ours, not Airwallex's. */
export function mapTransfer(
  payload: unknown,
  mode: ExecutionSummary['mode'],
): ExecutionSummary {
  if (!isRecord(payload)) bad('transfer response is not an object');
  const status = requiredString(payload, 'status');
  const transferCurrency = requiredString(payload, 'transfer_currency');
  const sourceCurrency = requiredString(payload, 'source_currency');
  const updatedRaw = requiredString(payload, 'updated_at');
  const feeAmount = optionalDecimal(payload, 'fee_amount');
  const feeCurrency = optionalString(payload, 'fee_currency');
  const feePaidBy = optionalString(payload, 'fee_paid_by');
  const funding = mapFunding(payload.funding);
  const failure = mapFailure(payload.failure);
  const swiftChargeOption = optionalString(payload, 'swift_charge_option');
  const transferDate = optionalString(payload, 'transfer_date');
  const dispatchDate = optionalString(payload, 'dispatch_date');
  const amountPayerPays = optionalDecimal(payload, 'amount_payer_pays');
  const amountBeneficiaryReceives = optionalDecimal(
    payload,
    'amount_beneficiary_receives',
  );
  return parseContract(
    executionSummarySchema,
    {
      transferId: requiredString(payload, 'id'),
      shortReferenceId: requiredString(payload, 'short_reference_id'),
      requestId: requiredString(payload, 'request_id'),
      status,
      ...(funding ? { funding } : {}),
      transferMethod: requiredString(payload, 'transfer_method'),
      rate: transferRate(payload.conversion, transferCurrency, sourceCurrency),
      sourceAmount: decimalField(payload, 'source_amount'),
      sourceCurrency,
      transferAmount: decimalField(payload, 'transfer_amount'),
      transferCurrency,
      ...(amountPayerPays ? { amountPayerPays } : {}),
      ...(amountBeneficiaryReceives ? { amountBeneficiaryReceives } : {}),
      ...(feeAmount && feeCurrency && feePaidBy
        ? {
            fee: {
              amount: feeAmount,
              currency: feeCurrency,
              paidBy: feePaidBy,
            },
          }
        : {}),
      ...(swiftChargeOption ? { swiftChargeOption } : {}),
      amountsTentative: APPROVAL_STATUSES.has(status),
      ...(transferDate ? { transferDate } : {}),
      ...(dispatchDate ? { dispatchDate } : {}),
      ...(failure ? { failure } : {}),
      ...(status === 'PAID'
        ? {
            lateFailureWatchUntil: new Date(
              Date.parse(toIsoUtc(updatedRaw)) + LATE_FAILURE_MS,
            ).toISOString(),
          }
        : {}),
      updatedAt: toIsoUtc(updatedRaw),
      mode,
    },
    'transfer',
  );
}

export function mapBalances(payload: unknown, asOf: string): BalanceSummary[] {
  const rows = asList(payload, 'balances');
  const summaries: BalanceSummary[] = [];
  for (const row of rows) {
    if (!isRecord(row)) bad('balance row is not an object');
    const accountType = optionalString(row, 'account_type');
    if (accountType !== undefined && accountType !== 'cash') continue;
    summaries.push(
      parseContract(
        balanceSummarySchema,
        {
          currency: requiredString(row, 'currency'),
          available: decimalField(row, 'available_amount'),
          pending: decimalField(row, 'pending_amount'),
          reserved: decimalField(row, 'reserved_amount'),
          total: decimalField(row, 'total_amount'),
          asOf,
        },
        'balance',
      ),
    );
  }
  return summaries;
}

export function mapBalanceHistory(payload: unknown): BalanceHistoryPage {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    bad('balance history has no items');
  }
  const items = payload.items.map((row) => {
    if (!isRecord(row)) bad('balance history row is not an object');
    return {
      amount: decimalField(row, 'amount'),
      balance: decimalField(row, 'balance'),
      currency: requiredString(row, 'currency'),
      source: optionalString(row, 'source'),
      sourceType: optionalString(row, 'source_type'),
      transactionType: optionalString(row, 'transaction_type'),
      postedAt: toIsoUtc(requiredString(row, 'posted_at')),
    };
  });
  return { items, pageAfter: optionalString(payload, 'page_after') };
}

export function mapFormSchema(
  payload: unknown,
  condition: BeneficiaryFormSchema['condition'],
): BeneficiaryFormSchema {
  if (!isRecord(payload) || !Array.isArray(payload.fields)) {
    bad('form schema has no fields');
  }
  return parseContract(
    beneficiaryFormSchemaSchema,
    { condition, fields: payload.fields.map(mapFormField) },
    'form schema',
  );
}

export function mapBankOptions(payload: unknown): {
  options: BankOption[];
  truncated: boolean;
} {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    bad('bank search has no items');
  }
  const options = payload.items.map((item) => {
    if (!isRecord(item)) bad('bank option is not an object');
    return {
      label: requiredString(item, 'label'),
      routingValue: requiredString(item, 'value'),
    };
  });
  return { options, truncated: payload.truncated === true };
}

export function mapVerification(
  payload: unknown,
  checkedAt: string,
): AccountVerification {
  if (!isRecord(payload)) bad('verification response is not an object');
  const details = isRecord(payload.details) ? payload.details : undefined;
  const nameMatch =
    typeof details?.account_name_match_result === 'string'
      ? details.account_name_match_result
      : undefined;
  const resolvedAccountName =
    optionalString(payload, 'resolved_account_name') ??
    (details ? optionalString(details, 'resolved_account_name') : undefined);
  const resolvedBankName =
    optionalString(payload, 'resolved_bank_name') ??
    (details ? optionalString(details, 'resolved_bank_name') : undefined);
  return parseContract(
    accountVerificationSchema,
    {
      code: requiredString(payload, 'code'),
      ...(nameMatch ? { nameMatch } : {}),
      ...(resolvedAccountName ? { resolvedAccountName } : {}),
      ...(resolvedBankName ? { resolvedBankName } : {}),
      checkedAt,
    },
    'verification',
  );
}

export function mapSupportedCurrencies(payload: unknown): SupportedCurrencies {
  if (!isRecord(payload)) bad('supported currencies response is not an object');
  return {
    buy: stringList(payload.buy_currencies, 'buy_currencies'),
    sell: stringList(payload.sell_currencies, 'sell_currencies'),
  };
}

export function mapNonConversionDays(payload: unknown): NonConversionDay[] {
  return asList(payload, 'invalid conversion dates').map((row) => {
    if (!isRecord(row)) bad('invalid conversion date is not an object');
    return parseContract(
      nonConversionDaySchema,
      {
        date: requiredString(row, 'date'),
        reason: requiredString(row, 'reason'),
      },
      'non-conversion day',
    );
  });
}

export function mapCorridorQuota(
  type: CorridorQuota['type'],
  payload: unknown,
): CorridorQuota {
  if (!isRecord(payload)) bad('quota response is not an object');
  return parseContract(
    corridorQuotaSchema,
    {
      type,
      available: decimalField(payload, 'available_order_amount'),
      currency: requiredString(payload, 'currency'),
    },
    'quota',
  );
}

export function mapBeneficiary(payload: unknown): MappedBeneficiary {
  if (!isRecord(payload)) bad('beneficiary response is not an object');
  const beneficiary = isRecord(payload.beneficiary)
    ? payload.beneficiary
    : undefined;
  if (!beneficiary) bad('beneficiary response has no beneficiary');
  const bank = isRecord(beneficiary.bank_details)
    ? beneficiary.bank_details
    : undefined;
  if (!bank) bad('beneficiary response has no bank_details');
  const company = optionalString(beneficiary, 'company_name');
  const person = [
    optionalString(beneficiary, 'first_name'),
    optionalString(beneficiary, 'last_name'),
  ]
    .filter((part): part is string => part !== undefined)
    .join(' ');
  const name = company ?? person;
  if (name.length === 0) bad('beneficiary response has no name');
  const account =
    optionalString(bank, 'account_number') ?? optionalString(bank, 'iban');
  if (!account) bad('beneficiary response has no account number');
  if (!Array.isArray(payload.transfer_methods))
    bad('beneficiary response has no transfer_methods');
  const transferMethods = payload.transfer_methods.filter(
    (method): method is string => typeof method === 'string',
  );
  return {
    airwallexBeneficiaryId: requiredString(payload, 'id'),
    name,
    entityType: requiredString(beneficiary, 'entity_type'),
    bankCountry: requiredString(bank, 'bank_country_code'),
    accountCurrency: requiredString(bank, 'account_currency'),
    bankName: optionalString(bank, 'bank_name'),
    maskedAccount: `••••${account.slice(-4)}`,
    transferMethods,
  };
}

function transferRate(
  conversion: unknown,
  transferCurrency: string,
  sourceCurrency: string,
): string {
  if (isRecord(conversion)) {
    return orient(
      decimalField(conversion, 'rate'),
      requiredString(conversion, 'currency_pair'),
      transferCurrency,
      sourceCurrency,
    );
  }
  if (transferCurrency === sourceCurrency) return '1';
  bad('transfer conversion is missing');
}

function mapFunding(value: unknown): ExecutionSummary['funding'] | undefined {
  if (!isRecord(value) || typeof value.status !== 'string') return undefined;
  const failureReason =
    typeof value.failure_reason === 'string' && value.failure_reason.length > 0
      ? value.failure_reason
      : undefined;
  return {
    status: value.status as NonNullable<ExecutionSummary['funding']>['status'],
    ...(failureReason ? { failureReason } : {}),
  };
}

function mapFailure(value: unknown): ExecutionSummary['failure'] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) bad('failure is not an object');
  const details = isRecord(value.details) ? value.details : undefined;
  const reasonCodes = Array.isArray(details?.reason_codes)
    ? details.reason_codes.filter(
        (code): code is string => typeof code === 'string',
      )
    : undefined;
  const type = typeof details?.type === 'string' ? details.type : undefined;
  const code = optionalString(value, 'code');
  const message = optionalString(value, 'message');
  return {
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
    ...(reasonCodes && reasonCodes.length > 0 ? { reasonCodes } : {}),
    category: failureCategory({ code, reasonCodes, type }),
  };
}

function mapFormField(value: unknown): FormSchemaField {
  if (!isRecord(value)) bad('form field is not an object');
  const field = isRecord(value.field) ? value.field : undefined;
  if (!field) bad('form field is missing field');
  const path = requiredString(value, 'path');
  const key =
    typeof field.key === 'string' && field.key.length > 0
      ? field.key
      : (path.split('.').at(-1) ?? path);
  const rule = isRecord(value.rule) ? value.rule : undefined;
  const pattern = typeof rule?.pattern === 'string' ? rule.pattern : undefined;
  const options = Array.isArray(field.options)
    ? field.options.map(mapOption)
    : undefined;
  const dynamic = mapDynamic(field.dynamic_options);
  return {
    path,
    key,
    label:
      typeof field.label === 'string' && field.label.length > 0
        ? field.label
        : key,
    type: requiredString(field, 'type') as FormSchemaField['type'],
    required: value.required === true,
    enabled: value.enabled !== false,
    refresh: field.refresh === true,
    ...copyString(field, 'default'),
    ...copyString(field, 'placeholder'),
    ...copyString(field, 'description'),
    ...copyString(field, 'tip'),
    ...copyString(field, 'example'),
    ...(pattern ? { pattern } : {}),
    ...(options && options.length > 0 ? { options } : {}),
    ...(dynamic ? { dynamic } : {}),
  };
}

function mapOption(
  value: unknown,
): NonNullable<FormSchemaField['options']>[number] {
  if (!isRecord(value)) bad('form option is not an object');
  const description =
    typeof value.description === 'string' ? value.description : undefined;
  const transferLimit = mapTransferLimit(value.transfer_limit);
  const flightTime = mapFlightTime(value.flight_time);
  return {
    label: requiredString(value, 'label'),
    value: requiredString(value, 'value'),
    ...(description ? { description } : {}),
    ...(transferLimit ? { transferLimit } : {}),
    ...(flightTime ? { flightTime } : {}),
  };
}

function mapTransferLimit(
  value: unknown,
):
  | NonNullable<
      NonNullable<FormSchemaField['options']>[number]['transferLimit']
    >
  | undefined {
  if (!isRecord(value)) return undefined;
  const min = moneyBound(value.min);
  const max = moneyBound(value.max);
  if (!min && !max) return undefined;
  return { ...(min ? { min } : {}), ...(max ? { max } : {}) };
}

function moneyBound(
  value: unknown,
): { amount: string; currency: string } | undefined {
  if (!isRecord(value)) return undefined;
  const amount = optionalDecimal(value, 'amount');
  const currency = optionalString(value, 'currency');
  if (!amount || !currency) return undefined;
  return { amount, currency };
}

function mapFlightTime(
  value: unknown,
):
  | NonNullable<NonNullable<FormSchemaField['options']>[number]['flightTime']>
  | undefined {
  if (!isRecord(value)) return undefined;
  const min = typeof value.min === 'string' ? value.min : undefined;
  const max = typeof value.max === 'string' ? value.max : undefined;
  if (!min && !max) return undefined;
  return { ...(min ? { min } : {}), ...(max ? { max } : {}) };
}

function mapDynamic(value: unknown): FormSchemaField['dynamic'] | undefined {
  if (!isRecord(value) || !Array.isArray(value.query_params)) return undefined;
  const params = value.query_params.map((param) => {
    if (!isRecord(param)) bad('dynamic option param is not an object');
    const pattern =
      typeof param.pattern === 'string' ? param.pattern : undefined;
    return {
      name: requiredString(param, 'name'),
      valueOf: requiredString(param, 'value_of'),
      required: param.required === true,
      ...(pattern ? { pattern } : {}),
    };
  });
  return { params };
}

function copyString(
  record: Record<string, unknown>,
  key: 'default' | 'placeholder' | 'description' | 'tip' | 'example',
): Partial<Pick<FormSchemaField, typeof key>> {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) return {};
  return { [key]: value };
}

function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) bad(`${label} is not a list`);
  return value.map((entry) => {
    if (typeof entry !== 'string' || entry.length === 0)
      bad(`${label} contains an empty code`);
    return entry;
  });
}

function asList(payload: unknown, label: string): unknown[] {
  if (Array.isArray(payload)) return payload;
  bad(`${label} response is not a list`);
}

function spreadBps(price: Decimal, mid: Decimal): number | undefined {
  if (mid.isZero()) return undefined;
  return price
    .minus(mid)
    .div(mid)
    .times(10_000)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}

function parseContract<T>(
  schema: z.ZodType<T>,
  value: unknown,
  label: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || label}: ${issue.message}`)
      .join('; ');
    bad(`${label} does not match the contract: ${detail}`);
  }
  return parsed.data;
}

function bad(message: string): never {
  throw new AirwallexError({
    status: 200,
    code: 'invalid_response',
    message,
  });
}
