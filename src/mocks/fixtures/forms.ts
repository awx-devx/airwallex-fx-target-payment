import type {
  BeneficiaryFormSchema,
  FieldError,
  FormSchemaField,
} from '@/contracts/airwallex';
import { fieldErrorMessage } from '@/contracts/airwallex-errors';

/**
 * Kit stand-ins for beneficiary form schemas. B2.1 replaces these with
 * recorded sandbox responses.
 */

function field(input: FormSchemaField): FormSchemaField {
  return input;
}

function error(
  path: string,
  code: string,
  params?: FieldError['params'],
): FieldError {
  return { path, code, message: fieldErrorMessage(code, params), params };
}

const transferMethod = (currency: string, localMax: string): FormSchemaField =>
  field({
    path: 'transfer_method',
    key: 'transfer_method',
    label: 'Transfer method',
    type: 'TRANSFER_METHOD',
    required: true,
    enabled: true,
    refresh: true,
    options: [
      {
        label: 'Local',
        value: 'LOCAL',
        description: 'Domestic rails',
        transferLimit: {
          min: { amount: '1.00', currency },
          max: { amount: localMax, currency },
        },
        flightTime: { min: 'P0D', max: 'P1D' },
      },
      {
        label: 'SWIFT',
        value: 'SWIFT',
        description: 'International wire',
        transferLimit: {
          min: { amount: '1.00', currency },
          max: { amount: '5000000.00', currency },
        },
        flightTime: { min: 'P0D', max: 'P3D' },
      },
    ],
  });

export const formSchemas: BeneficiaryFormSchema[] = [
  {
    condition: {
      bankCountry: 'DE',
      accountCurrency: 'EUR',
      transferMethod: 'LOCAL',
      entityType: 'COMPANY',
    },
    fields: [
      field({
        path: 'beneficiary.entity_type',
        key: 'entity_type',
        label: 'Entity type',
        type: 'RADIO',
        required: true,
        enabled: true,
        refresh: true,
        default: 'COMPANY',
        options: [
          { label: 'Company', value: 'COMPANY' },
          { label: 'Personal', value: 'PERSONAL' },
        ],
      }),
      field({
        path: 'beneficiary.bank_details.bank_country_code',
        key: 'bank_country_code',
        label: 'Bank country',
        type: 'SELECT',
        required: true,
        enabled: true,
        refresh: true,
        default: 'DE',
        options: [
          { label: 'Germany', value: 'DE' },
          { label: 'France', value: 'FR' },
        ],
      }),
      field({
        path: 'beneficiary.bank_details.iban',
        key: 'iban',
        label: 'IBAN',
        type: 'INPUT',
        required: true,
        enabled: true,
        refresh: false,
        placeholder: 'DE89…',
        example: 'DE89370400440532013000',
        pattern: '^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$',
      }),
      field({
        path: 'beneficiary.bank_details.swift_code',
        key: 'swift_code',
        label: 'SWIFT / BIC',
        type: 'INPUT',
        required: true,
        enabled: true,
        refresh: false,
        example: 'COBADEFFXXX',
      }),
      field({
        path: 'beneficiary.bank_details.account_name',
        key: 'account_name',
        label: 'Account name',
        type: 'INPUT',
        required: true,
        enabled: true,
        refresh: false,
      }),
      transferMethod('EUR', '1000000.00'),
    ],
  },
  {
    condition: {
      bankCountry: 'GB',
      accountCurrency: 'GBP',
      transferMethod: 'LOCAL',
      entityType: 'COMPANY',
    },
    fields: [
      field({
        path: 'beneficiary.bank_details.account_routing_value1',
        key: 'account_routing_value1',
        label: 'Sort code',
        type: 'INPUT',
        required: true,
        enabled: true,
        refresh: false,
        placeholder: '20-00-00',
        pattern: '^[0-9]{6}$',
      }),
      field({
        path: 'beneficiary.bank_details.account_number',
        key: 'account_number',
        label: 'Account number',
        type: 'INPUT',
        required: true,
        enabled: true,
        refresh: false,
        pattern: '^[0-9]{8}$',
      }),
      field({
        path: 'beneficiary.bank_details.bank_name',
        key: 'bank_name',
        label: 'Bank',
        type: 'DYNAMIC_SELECT',
        required: true,
        enabled: true,
        refresh: false,
        dynamic: {
          params: [
            {
              name: 'bank_country_code',
              valueOf: 'beneficiary.bank_details.bank_country_code',
              required: true,
            },
            {
              name: 'account_currency',
              valueOf: 'beneficiary.bank_details.account_currency',
              required: true,
            },
            {
              name: 'keyword',
              valueOf: 'beneficiary.bank_details.bank_name',
              required: false,
            },
          ],
        },
      }),
      transferMethod('GBP', '1000000.00'),
    ],
  },
  {
    condition: {
      bankCountry: 'IN',
      accountCurrency: 'INR',
      transferMethod: 'LOCAL',
      entityType: 'COMPANY',
    },
    fields: [
      field({
        path: 'beneficiary.bank_details.account_routing_value1',
        key: 'account_routing_value1',
        label: 'IFSC',
        type: 'INPUT',
        required: true,
        enabled: true,
        refresh: false,
        example: 'HDFC0000001',
        pattern: '^[A-Z]{4}0[A-Z0-9]{6}$',
      }),
      field({
        path: 'beneficiary.bank_details.account_number',
        key: 'account_number',
        label: 'Account number',
        type: 'INPUT',
        required: true,
        enabled: true,
        refresh: false,
      }),
      field({
        path: 'beneficiary.bank_details.account_name',
        key: 'account_name',
        label: 'Account name',
        type: 'INPUT',
        required: true,
        enabled: true,
        refresh: false,
      }),
      transferMethod('INR', '1500000.00'),
    ],
  },
  {
    condition: {
      bankCountry: 'US',
      accountCurrency: 'USD',
      transferMethod: 'LOCAL',
      entityType: 'COMPANY',
    },
    fields: [
      field({
        path: 'beneficiary.bank_details.account_routing_value1',
        key: 'account_routing_value1',
        label: 'ACH routing number',
        type: 'INPUT',
        required: true,
        enabled: true,
        refresh: false,
        pattern: '^[0-9]{9}$',
      }),
      field({
        path: 'beneficiary.bank_details.account_number',
        key: 'account_number',
        label: 'Account number',
        type: 'INPUT',
        required: true,
        enabled: true,
        refresh: false,
      }),
      field({
        path: 'beneficiary.bank_details.account_type',
        key: 'account_type',
        label: 'Account type',
        type: 'SELECT',
        required: true,
        enabled: true,
        refresh: false,
        options: [
          { label: 'Checking', value: 'CHECKING' },
          { label: 'Savings', value: 'SAVINGS' },
        ],
      }),
      transferMethod('USD', '1000000.00'),
    ],
  },
];

export const fieldErrorsByCorridor: Record<string, FieldError[]> = {
  EUR: [
    error('beneficiary.bank_details.iban', '036'),
    error('beneficiary.address.street_address', '018', {
      length_min: 5,
      length_max: 200,
    }),
  ],
  GBP: [
    error('beneficiary.bank_details.account_number', '018', {
      length_min: 8,
      length_max: 8,
    }),
  ],
  INR: [error('beneficiary.bank_details.account_routing_value1', '035')],
  USD: [error('beneficiary.bank_details.account_routing_value1', '008')],
};

export function formSchemaFor(
  country: string,
  currency: string,
): BeneficiaryFormSchema | undefined {
  return formSchemas.find(
    (schema) =>
      schema.condition.bankCountry === country &&
      schema.condition.accountCurrency === currency,
  );
}
