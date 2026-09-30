import type { TransferMethod } from '@/contracts/airwallex';

/**
 * Corridors the generator can build bank details for.
 * Bank identifiers are format examples, replaced after V12.
 */
export interface Corridor {
  currency: string;
  country: string;
  method: TransferMethod;
  taxRate: string;
  unitMin: string;
  unitMax: string;
  legalSuffix: string;
  kind: 'iban' | 'gb' | 'ifsc' | 'bsb' | 'aba' | 'jp' | 'routing';
  bankCode?: string;
  bic?: string;
  bbanLength?: number;
}

export const CORRIDORS: readonly Corridor[] = [
  {
    currency: 'EUR',
    country: 'DE',
    method: 'LOCAL',
    taxRate: '0.19',
    unitMin: '1000',
    unitMax: '40000',
    legalSuffix: 'GmbH',
    kind: 'iban',
    bankCode: '37040044',
    bic: 'COBADEFFXXX',
    bbanLength: 18,
  },
  {
    currency: 'GBP',
    country: 'GB',
    method: 'LOCAL',
    taxRate: '0.20',
    unitMin: '500',
    unitMax: '20000',
    legalSuffix: 'Ltd',
    kind: 'gb',
    bankCode: '200000',
  },
  {
    currency: 'JPY',
    country: 'JP',
    method: 'SWIFT',
    taxRate: '0.10',
    unitMin: '100000',
    unitMax: '2000000',
    legalSuffix: 'K.K.',
    kind: 'jp',
    bankCode: '0005',
  },
  {
    currency: 'SGD',
    country: 'SG',
    method: 'LOCAL',
    taxRate: '0.09',
    unitMin: '500',
    unitMax: '15000',
    legalSuffix: 'Pte Ltd',
    kind: 'routing',
    bankCode: '7171',
  },
  {
    currency: 'AUD',
    country: 'AU',
    method: 'LOCAL',
    taxRate: '0.10',
    unitMin: '400',
    unitMax: '12000',
    legalSuffix: 'Pty Ltd',
    kind: 'bsb',
    bankCode: '062000',
  },
  {
    currency: 'INR',
    country: 'IN',
    method: 'LOCAL',
    taxRate: '0.18',
    unitMin: '20000',
    unitMax: '800000',
    legalSuffix: 'Pvt Ltd',
    kind: 'ifsc',
    bankCode: 'HDFC',
  },
  {
    currency: 'CHF',
    country: 'CH',
    method: 'LOCAL',
    taxRate: '0.081',
    unitMin: '400',
    unitMax: '12000',
    legalSuffix: 'AG',
    kind: 'iban',
    bankCode: '00762',
    bic: 'BCVLCH2LXXX',
    bbanLength: 17,
  },
  {
    currency: 'HKD',
    country: 'HK',
    method: 'LOCAL',
    taxRate: '0',
    unitMin: '2000',
    unitMax: '40000',
    legalSuffix: 'Ltd',
    kind: 'routing',
    bankCode: '004',
  },
  {
    currency: 'CAD',
    country: 'CA',
    method: 'LOCAL',
    taxRate: '0.05',
    unitMin: '400',
    unitMax: '12000',
    legalSuffix: 'Ltd',
    kind: 'routing',
    bankCode: '0003',
  },
  {
    currency: 'NZD',
    country: 'NZ',
    method: 'LOCAL',
    taxRate: '0.15',
    unitMin: '400',
    unitMax: '10000',
    legalSuffix: 'Ltd',
    kind: 'routing',
    bankCode: '12',
  },
  {
    currency: 'THB',
    country: 'TH',
    method: 'LOCAL',
    taxRate: '0.07',
    unitMin: '5000',
    unitMax: '80000',
    legalSuffix: 'Ltd',
    kind: 'routing',
    bankCode: '002',
  },
  {
    currency: 'KRW',
    country: 'KR',
    method: 'LOCAL',
    taxRate: '0.10',
    unitMin: '200000',
    unitMax: '4000000',
    legalSuffix: 'Ltd',
    kind: 'routing',
    bankCode: '004',
  },
  {
    currency: 'VND',
    country: 'VN',
    method: 'LOCAL',
    taxRate: '0.10',
    unitMin: '5000000',
    unitMax: '80000000',
    legalSuffix: 'Ltd',
    kind: 'routing',
    bankCode: '012',
  },
  {
    currency: 'PHP',
    country: 'PH',
    method: 'LOCAL',
    taxRate: '0.12',
    unitMin: '10000',
    unitMax: '200000',
    legalSuffix: 'Inc',
    kind: 'routing',
    bankCode: '010',
  },
  {
    currency: 'IDR',
    country: 'ID',
    method: 'LOCAL',
    taxRate: '0.11',
    unitMin: '5000000',
    unitMax: '80000000',
    legalSuffix: 'PT',
    kind: 'routing',
    bankCode: '014',
  },
  {
    currency: 'MYR',
    country: 'MY',
    method: 'LOCAL',
    taxRate: '0.08',
    unitMin: '1000',
    unitMax: '20000',
    legalSuffix: 'Sdn Bhd',
    kind: 'routing',
    bankCode: '33',
  },
  {
    currency: 'AED',
    country: 'AE',
    method: 'LOCAL',
    taxRate: '0.05',
    unitMin: '1000',
    unitMax: '20000',
    legalSuffix: 'LLC',
    kind: 'iban',
    bankCode: '033',
    bic: 'BOMLAEADXXX',
    bbanLength: 19,
  },
  {
    currency: 'SEK',
    country: 'SE',
    method: 'LOCAL',
    taxRate: '0.25',
    unitMin: '2000',
    unitMax: '40000',
    legalSuffix: 'AB',
    kind: 'routing',
    bankCode: '500',
  },
  {
    currency: 'MXN',
    country: 'MX',
    method: 'LOCAL',
    taxRate: '0.16',
    unitMin: '5000',
    unitMax: '80000',
    legalSuffix: 'SA',
    kind: 'routing',
    bankCode: '012',
  },
  {
    currency: 'CNY',
    country: 'CN',
    method: 'SWIFT',
    taxRate: '0.13',
    unitMin: '2000',
    unitMax: '40000',
    legalSuffix: 'Co',
    kind: 'routing',
    bankCode: '102',
  },
];

export const PRIMARY_CORRIDORS = [
  'EUR',
  'GBP',
  'JPY',
  'SGD',
  'AUD',
  'INR',
] as const;

export function corridorByCurrency(currency: string): Corridor | undefined {
  return CORRIDORS.find((corridor) => corridor.currency === currency);
}

export function requireCorridor(currency: string): Corridor {
  const corridor = corridorByCurrency(currency);
  if (!corridor) throw new Error(`No generator corridor for ${currency}`);
  return corridor;
}
