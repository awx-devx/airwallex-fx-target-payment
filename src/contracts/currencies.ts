import { D, formatDecimal } from '@/contracts/money';
import type Decimal from 'decimal.js';

/**
 * Payout precision and FX capability.
 *
 * AIRWALLEX: payout decimals follow the Payouts currency table. KES and SAR are
 * 0 dp for payouts and 2 dp in ISO 4217. FX flags follow Supported regions and
 * currencies; the account's supported_currencies response overrides `enabledOnAccount`.
 * https://www.airwallex.com/docs/payouts/how-airwallex-payouts-work/currency-precision
 * https://www.airwallex.com/docs/transactional-fx/supported-regions-and-currencies
 */

export interface CurrencyFx {
  buy: boolean;
  sell: boolean;
  pureConversion: boolean;
  convertAndPayout: boolean;
  note?: string;
}

export interface CurrencyInfo {
  code: string;
  name: string;
  payoutPrecision: number;
  isoPrecision: number;
  fx: CurrencyFx;
  enabledOnAccount?: { buy: boolean; sell: boolean };
}

type Row = readonly [code: string, name: string, payoutPrecision: 0 | 2 | 3];

const ROWS = [
  ['AED', 'United Arab Emirates dirham', 2],
  ['ALL', 'Albanian lek', 2],
  ['AMD', 'Armenian dram', 2],
  ['AOA', 'Angolan kwanza', 2],
  ['ARS', 'Argentine peso', 2],
  ['AUD', 'Australian dollar', 2],
  ['AZN', 'Azerbaijan manat', 2],
  ['BAM', 'Bosnia and Herzegovina convertible mark', 2],
  ['BBD', 'Barbadian dollar', 2],
  ['BDT', 'Bangladeshi taka', 2],
  ['BGN', 'Bulgarian lev', 2],
  ['BHD', 'Bahraini dinar', 3],
  ['BOB', 'Boliviano', 2],
  ['BRL', 'Brazilian real', 2],
  ['BSD', 'Bahamian dollar', 2],
  ['BWP', 'Botswanan pula', 2],
  ['BZD', 'Belize dollar', 2],
  ['CAD', 'Canadian dollar', 2],
  ['CHF', 'Swiss franc', 2],
  ['CLP', 'Chilean peso', 0],
  ['CNY', 'Chinese yuan', 2],
  ['COP', 'Colombian peso', 2],
  ['CRC', 'Costa Rican colón', 2],
  ['CZK', 'Czech koruna', 2],
  ['DKK', 'Danish krone', 2],
  ['DOP', 'Dominican peso', 2],
  ['DZD', 'Algerian dinar', 2],
  ['EGP', 'Egyptian pound', 2],
  ['EUR', 'Euro', 2],
  ['FJD', 'Fiji dollar', 2],
  ['GBP', 'Pound sterling', 2],
  ['GEL', 'Georgian lari', 2],
  ['GHS', 'Ghanaian cedi', 2],
  ['GMD', 'Gambian dalasi', 2],
  ['GTQ', 'Guatemalan quetzal', 2],
  ['GYD', 'Guyanese dollar', 2],
  ['HKD', 'Hong Kong dollar', 2],
  ['HNL', 'Honduran lempira', 2],
  ['HUF', 'Hungarian forint', 2],
  ['IDR', 'Indonesian rupiah', 2],
  ['ILS', 'Israeli new shekel', 2],
  ['INR', 'Indian rupee', 2],
  ['ISK', 'Icelandic króna', 0],
  ['JMD', 'Jamaican dollar', 2],
  ['JOD', 'Jordanian dinar', 3],
  ['JPY', 'Japanese yen', 0],
  ['KES', 'Kenyan shilling', 0],
  ['KGS', 'Kyrgyzstani som', 2],
  ['KRW', 'South Korean won', 0],
  ['KWD', 'Kuwaiti dinar', 3],
  ['KZT', 'Kazakhstani tenge', 2],
  ['LKR', 'Sri Lankan rupee', 2],
  ['LSL', 'Lesotho loti', 2],
  ['MAD', 'Moroccan dirham', 2],
  ['MGA', 'Malagasy ariary', 2],
  ['MUR', 'Mauritian rupee', 2],
  ['MWK', 'Malawian kwacha', 2],
  ['MXN', 'Mexican peso', 2],
  ['MYR', 'Malaysian ringgit', 2],
  ['NAD', 'Namibian dollar', 2],
  ['NGN', 'Nigerian naira', 2],
  ['NIO', 'Nicaraguan córdoba', 2],
  ['NOK', 'Norwegian krone', 2],
  ['NPR', 'Nepalese rupee', 2],
  ['NZD', 'New Zealand dollar', 2],
  ['OMR', 'Omani rial', 3],
  ['PEN', 'Peruvian sol', 2],
  ['PHP', 'Philippine peso', 2],
  ['PKR', 'Pakistani rupee', 2],
  ['PLN', 'Polish złoty', 2],
  ['PYG', 'Paraguayan guaraní', 0],
  ['QAR', 'Qatari riyal', 2],
  ['RON', 'Romanian leu', 2],
  ['RSD', 'Serbian dinar', 2],
  ['RWF', 'Rwandan franc', 0],
  ['SAR', 'Saudi riyal', 0],
  ['SCR', 'Seychellois rupee', 2],
  ['SEK', 'Swedish krona', 2],
  ['SGD', 'Singapore dollar', 2],
  ['THB', 'Thai baht', 2],
  ['TND', 'Tunisian dinar', 3],
  ['TRY', 'Turkish lira', 2],
  ['TTD', 'Trinidad and Tobago dollar', 2],
  ['TZS', 'Tanzanian shilling', 2],
  ['USD', 'United States dollar', 2],
  ['UYU', 'Uruguayan peso', 2],
  ['VND', 'Vietnamese đồng', 0],
  ['XAF', 'Central African CFA franc', 0],
  ['XOF', 'West African CFA franc', 0],
  ['ZAR', 'South African rand', 2],
  ['ZMW', 'Zambian kwacha', 2],
] as const satisfies readonly Row[];

/** Freely bought, sold, held, and paid out. */
const FULL = new Set([
  'AUD',
  'BRL',
  'CAD',
  'CHF',
  'CNY',
  'CZK',
  'DKK',
  'EUR',
  'GBP',
  'HKD',
  'HUF',
  'ILS',
  'JPY',
  'KRW',
  'MXN',
  'NOK',
  'NZD',
  'PLN',
  'RON',
  'SEK',
  'SGD',
  'THB',
  'USD',
  'VND',
  'ZAR',
]);

/** ISO 4217 decimals where they differ from the payout table. */
const ISO_PRECISION: Record<string, number> = {
  KES: 2,
  SAR: 2,
};

const ALL_TRUE: CurrencyFx = {
  buy: true,
  sell: true,
  pureConversion: true,
  convertAndPayout: true,
};

const BUY_AND_PAYOUT: CurrencyFx = {
  buy: true,
  sell: false,
  pureConversion: false,
  convertAndPayout: true,
};

function fxFor(code: string): CurrencyFx {
  if (code === 'MYR') {
    return {
      ...ALL_TRUE,
      note: 'Sell and wallet only for MY customers',
    };
  }
  if (code === 'IDR') {
    return {
      buy: true,
      sell: true,
      pureConversion: false,
      convertAndPayout: true,
      note: 'Sell only for CN and HK customers',
    };
  }
  if (code === 'AED') {
    return {
      ...ALL_TRUE,
      note: 'Sell and wallet exclude UAE customers',
    };
  }
  if (code === 'BHD') {
    return {
      ...BUY_AND_PAYOUT,
      note: 'Buy only for CN and HK customers',
    };
  }
  if (FULL.has(code)) return ALL_TRUE;
  return BUY_AND_PAYOUT;
}

export const CURRENCIES: readonly CurrencyInfo[] = ROWS.map(
  ([code, name, payoutPrecision]) => ({
    code,
    name,
    payoutPrecision,
    isoPrecision: ISO_PRECISION[code] ?? payoutPrecision,
    fx: fxFor(code),
  }),
);

const BY_CODE = new Map(CURRENCIES.map((currency) => [currency.code, currency]));

export function getCurrency(code: string): CurrencyInfo | undefined {
  return BY_CODE.get(code);
}

export function requireCurrency(code: string): CurrencyInfo {
  const currency = BY_CODE.get(code);
  if (!currency) throw new Error(`Unknown currency: ${code}`);
  return currency;
}

export function isCurrencyCode(code: string): boolean {
  return BY_CODE.has(code);
}

/** Round a decimal string to Airwallex payout precision for `code`. */
export function roundToPayout(code: string, value: string | Decimal): string {
  return formatDecimal(D(value), requireCurrency(code).payoutPrecision);
}

/**
 * One pip in the quote currency. Zero-decimal quotes (JPY, KRW, …) use 0.01;
 * every other quote uses 0.0001.
 */
export function pipSize(quote: string): string {
  return requireCurrency(quote).payoutPrecision === 0 ? '0.01' : '0.0001';
}
