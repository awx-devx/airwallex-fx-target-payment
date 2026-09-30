import { z } from 'zod';
import { isCurrencyCode } from '@/contracts/currencies';
import { isDecimalString } from '@/contracts/money';

export const decimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/, {
  message: 'Expected a decimal string',
});

export const currencyCodeSchema = z.string().refine(isCurrencyCode, {
  message: 'Unknown currency',
});

export const isoDateSchema = z.iso.date();
export const isoDateTimeSchema = z.iso.datetime();

export const TRANSFER_STATUSES = [
  'IN_APPROVAL',
  'APPROVAL_RECALLED',
  'APPROVAL_REJECTED',
  'APPROVAL_BLOCKED',
  'SCHEDULED',
  'OVERDUE',
  'PROCESSING',
  'SENT',
  'PAID',
  'FAILED',
  'CANCELLED',
] as const;
export const transferStatusSchema = z.enum(TRANSFER_STATUSES);
export type TransferStatus = z.infer<typeof transferStatusSchema>;

export const FUNDING_STATUSES = [
  'REQUIRES_FUNDING_CONFIRMATION',
  'SCHEDULED',
  'PROCESSING',
  'FUNDED',
  'FAILED',
  'CANCELLED',
  'REVERSED',
] as const;
export const fundingStatusSchema = z.enum(FUNDING_STATUSES);
export type FundingStatus = z.infer<typeof fundingStatusSchema>;

export const TRANSFER_METHODS = ['LOCAL', 'SWIFT'] as const;
export const transferMethodSchema = z.enum(TRANSFER_METHODS);
export type TransferMethod = z.infer<typeof transferMethodSchema>;

export const TRANSFER_REASONS = [
  'audio_visual_services',
  'bill_payment',
  'business_expenses',
  'construction',
  'donation_charitable_contribution',
  'education_training',
  'freight',
  'goods_purchased',
  'investment_capital',
  'investment_proceeds',
  'living_expenses',
  'loan_credit_repayment',
  'medical_services',
  'pension',
  'professional_business_services',
  'real_estate',
  'taxes',
  'technical_services',
  'transfer_to_own_account',
  'travel',
  'wages_salary',
  'other_services',
] as const;
export const transferReasonSchema = z.enum(TRANSFER_REASONS);
export type TransferReason = z.infer<typeof transferReasonSchema>;

/** Reasons the test-data generator is allowed to pick. */
export const GENERATOR_TRANSFER_REASONS = [
  'goods_purchased',
  'professional_business_services',
  'freight',
  'technical_services',
  'bill_payment',
] as const satisfies readonly TransferReason[];

export const QUOTE_VALIDITIES = [
  'MIN_1',
  'MIN_15',
  'MIN_30',
  'HR_1',
  'HR_4',
  'HR_8',
  'HR_24',
] as const;
export const quoteValiditySchema = z.enum(QUOTE_VALIDITIES);
export type QuoteValidity = z.infer<typeof quoteValiditySchema>;

export const FAILURE_CATEGORIES = [
  'BENEFICIARY_DETAILS',
  'ACCOUNT',
  'RETURNED',
  'FUNDS_OR_LIMITS',
  'COMPLIANCE',
  'CLIENT',
  'SYSTEM',
] as const;
export const failureCategorySchema = z.enum(FAILURE_CATEGORIES);
export type FailureCategory = z.infer<typeof failureCategorySchema>;

export const quoteUsageSchema = z.enum(['SINGLE_USE', 'MULTI_USE']);

export const quoteSummarySchema = z.object({
  airwallexQuoteId: z.string().min(1),
  price: decimalStringSchema,
  sellAmount: decimalStringSchema,
  buyAmount: decimalStringSchema,
  clientRate: decimalStringSchema,
  clientRateOriented: decimalStringSchema,
  midPrice: decimalStringSchema.optional(),
  spreadBps: z.number().optional(),
  validity: quoteValiditySchema,
  validFromAt: isoDateTimeSchema,
  validToAt: isoDateTimeSchema,
  usage: quoteUsageSchema,
  conversionDate: isoDateSchema,
});
export type QuoteSummary = z.infer<typeof quoteSummarySchema>;

export const executionSummarySchema = z.object({
  transferId: z.string().min(1),
  shortReferenceId: z.string().min(1),
  requestId: z.string().min(1),
  status: transferStatusSchema,
  funding: z
    .object({
      status: fundingStatusSchema,
      failureReason: z.string().optional(),
    })
    .optional(),
  transferMethod: transferMethodSchema,
  rate: decimalStringSchema,
  sourceAmount: decimalStringSchema,
  sourceCurrency: currencyCodeSchema,
  transferAmount: decimalStringSchema,
  transferCurrency: currencyCodeSchema,
  amountPayerPays: decimalStringSchema.optional(),
  amountBeneficiaryReceives: decimalStringSchema.optional(),
  fee: z
    .object({
      amount: decimalStringSchema,
      currency: currencyCodeSchema,
      paidBy: z.enum(['PAYER', 'BENEFICIARY']),
    })
    .optional(),
  swiftChargeOption: z.enum(['SHARED', 'PAYER']).optional(),
  amountsTentative: z.boolean(),
  transferDate: isoDateSchema.optional(),
  dispatchDate: isoDateSchema.optional(),
  failure: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
      reasonCodes: z.array(z.string()).optional(),
      category: failureCategorySchema,
    })
    .optional(),
  lateFailureWatchUntil: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema,
  mode: z.enum(['APPROVED', 'STANDING_INSTRUCTION']),
});
export type ExecutionSummary = z.infer<typeof executionSummarySchema>;

export const balanceSummarySchema = z.object({
  currency: currencyCodeSchema,
  available: decimalStringSchema,
  pending: decimalStringSchema,
  reserved: decimalStringSchema,
  total: decimalStringSchema,
  asOf: isoDateTimeSchema,
});
export type BalanceSummary = z.infer<typeof balanceSummarySchema>;

export const ACCOUNT_VERIFICATION_CODES = [
  'VERIFIED',
  'INVALID',
  'CANNOT_VERIFY',
  'EXTERNAL_SERVICE_UNAVAILABLE',
  'NOT_SUPPORTED',
] as const;
export const accountVerificationCodeSchema = z.enum(ACCOUNT_VERIFICATION_CODES);
export type AccountVerificationCode = z.infer<typeof accountVerificationCodeSchema>;

export const NAME_MATCHES = [
  'FULL_MATCH',
  'PARTIAL_MATCH',
  'NOT_MATCHED',
  'FULL_MATCH_INCORRECT_TYPE',
  'PARTIAL_MATCH_INCORRECT_TYPE',
] as const;
export const nameMatchSchema = z.enum(NAME_MATCHES);
export type NameMatch = z.infer<typeof nameMatchSchema>;

export const accountVerificationSchema = z.object({
  code: accountVerificationCodeSchema,
  nameMatch: nameMatchSchema.optional(),
  resolvedAccountName: z.string().optional(),
  resolvedBankName: z.string().optional(),
  checkedAt: isoDateTimeSchema,
});
export type AccountVerification = z.infer<typeof accountVerificationSchema>;

export const ENTITY_TYPES = ['COMPANY', 'PERSONAL'] as const;
export const entityTypeSchema = z.enum(ENTITY_TYPES);
export type EntityType = z.infer<typeof entityTypeSchema>;

export const beneficiarySummarySchema = z.object({
  id: z.string().min(1),
  airwallexBeneficiaryId: z.string().min(1),
  name: z.string().min(1),
  entityType: entityTypeSchema,
  bankCountry: z.string().length(2),
  accountCurrency: currencyCodeSchema,
  bankName: z.string().optional(),
  maskedAccount: z.string().min(1),
  transferMethods: z.array(transferMethodSchema).min(1),
  verification: accountVerificationSchema.optional(),
});
export type BeneficiarySummary = z.infer<typeof beneficiarySummarySchema>;

export const FORM_FIELD_TYPES = [
  'INPUT',
  'SELECT',
  'DYNAMIC_SELECT',
  'RADIO',
  'TRANSFER_METHOD',
] as const;
export const formFieldTypeSchema = z.enum(FORM_FIELD_TYPES);
export type FormFieldType = z.infer<typeof formFieldTypeSchema>;

const moneyLimitSchema = z.object({
  amount: decimalStringSchema,
  currency: currencyCodeSchema,
});

export const formSchemaFieldSchema = z.object({
  path: z.string().min(1),
  key: z.string().min(1),
  label: z.string().min(1),
  type: formFieldTypeSchema,
  required: z.boolean(),
  enabled: z.boolean(),
  refresh: z.boolean(),
  default: z.string().optional(),
  placeholder: z.string().optional(),
  description: z.string().optional(),
  tip: z.string().optional(),
  example: z.string().optional(),
  pattern: z.string().optional(),
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        description: z.string().optional(),
        transferLimit: z
          .object({
            min: moneyLimitSchema.optional(),
            max: moneyLimitSchema.optional(),
          })
          .optional(),
        flightTime: z
          .object({
            min: z.string().optional(),
            max: z.string().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  dynamic: z
    .object({
      params: z.array(
        z.object({
          name: z.string(),
          valueOf: z.string(),
          required: z.boolean(),
          pattern: z.string().optional(),
        }),
      ),
    })
    .optional(),
});
export type FormSchemaField = z.infer<typeof formSchemaFieldSchema>;

export const beneficiaryFormSchemaSchema = z.object({
  condition: z.object({
    bankCountry: z.string().length(2),
    accountCurrency: currencyCodeSchema,
    transferMethod: transferMethodSchema,
    entityType: entityTypeSchema,
  }),
  fields: z.array(formSchemaFieldSchema),
});
export type BeneficiaryFormSchema = z.infer<typeof beneficiaryFormSchemaSchema>;

export const bankOptionSchema = z.object({
  label: z.string(),
  routingValue: z.string(),
});
export type BankOption = z.infer<typeof bankOptionSchema>;

export const nonConversionDaySchema = z.object({
  date: isoDateSchema,
  reason: z.string(),
});
export type NonConversionDay = z.infer<typeof nonConversionDaySchema>;

export const corridorQuotaSchema = z.object({
  type: z.enum(['ID_OUTBOUND', 'VN_OUTBOUND']),
  available: decimalStringSchema,
  currency: currencyCodeSchema,
});
export type CorridorQuota = z.infer<typeof corridorQuotaSchema>;

export const fieldErrorSchema = z.object({
  path: z.string().min(1),
  code: z.string().min(1),
  message: z.string().min(1),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});
export type FieldError = z.infer<typeof fieldErrorSchema>;

export const API_ERROR_CODES = [
  'INVALID_STATE',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'QUOTE_EXPIRED',
  'QUOTE_INVALID',
  'INSUFFICIENT_BALANCE',
  'AMOUNT_LIMIT',
  'ROUTE_UNSUPPORTED',
  'DATE_INVALID',
  'CORRIDOR_REQUIREMENT',
  'TRANSFER_NOT_CANCELLABLE',
  'RATE_LIMITED',
  'AIRWALLEX_UNAVAILABLE',
  'AIRWALLEX_CONFIG',
  'AIRWALLEX_ERROR',
] as const;
export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string().min(1),
  fieldErrors: z.array(fieldErrorSchema).optional(),
  details: z.unknown().optional(),
  airwallex: z
    .object({
      code: z.string(),
      source: z.string().optional(),
    })
    .optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const errorEnvelopeSchema = z.object({ error: apiErrorSchema });

export function assertDecimalString(value: string): void {
  if (!isDecimalString(value)) throw new Error(`Not a decimal string: ${value}`);
}
