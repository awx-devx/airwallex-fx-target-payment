import type { ApiErrorCode } from '@/contracts/airwallex';
import type { BillFlags } from '@/contracts/bill';
import { getCurrency } from '@/contracts/currencies';
import { D } from '@/contracts/money';

const USD_MIN = D('1');
const USD_MAX = D('5000000');

export interface BillCheckInput {
  billCurrency: string;
  homeCurrency: string;
  amount: string;
  dueDate: string;
  today: string;
  /** Home-currency cost when a price is known. Compared with the $1–$5M band when home is USD. */
  usdEquivalent?: string;
  /** Account buy list from supported_currencies. Overrides the static table when present. */
  buyCurrencies?: readonly string[];
}

export interface BillCheckIssue {
  code: ApiErrorCode;
  message: string;
}

export function checkBill(input: BillCheckInput): { flags: BillFlags; issues: BillCheckIssue[] } {
  const flags: BillFlags = {};
  const issues: BillCheckIssue[] = [];
  if (input.dueDate < input.today) flags.overdue = true;
  if (input.dueDate > plusOneYear(input.today)) {
    issues.push({ code: 'DATE_INVALID', message: 'Due date is more than a year out' });
  }
  if (!payable(input.billCurrency, input.homeCurrency, input.buyCurrencies)) {
    flags.routeUnsupported = true;
    issues.push({
      code: 'ROUTE_UNSUPPORTED',
      message:
        input.billCurrency === input.homeCurrency
          ? 'A bill in the home currency has nothing to convert'
          : `${input.billCurrency} is not payable`,
    });
  }
  const precision = getCurrency(input.billCurrency)?.payoutPrecision;
  if (precision !== undefined && decimalPlaces(input.amount) > precision) {
    issues.push({
      code: 'VALIDATION_FAILED',
      message: `${input.billCurrency} amounts use at most ${precision} decimal places`,
    });
  }
  const usd = usdAmount(input);
  if (usd && D(input.amount).gt(0) && (usd.lt(USD_MIN) || usd.gt(USD_MAX))) {
    flags.amountLimit = true;
    issues.push({
      code: 'AMOUNT_LIMIT',
      message: 'Outside Airwallex FX limits ($1–$5M)',
    });
  }
  return { flags, issues };
}

function payable(
  currency: string,
  home: string,
  buyCurrencies: readonly string[] | undefined,
): boolean {
  if (currency === home) return false;
  if (buyCurrencies) return buyCurrencies.includes(currency);
  const info = getCurrency(currency);
  if (!info) return false;
  return info.fx.convertAndPayout || info.fx.buy;
}

function usdAmount(input: BillCheckInput): ReturnType<typeof D> | undefined {
  if (input.billCurrency === 'USD' && D(input.amount).gt(0)) return D(input.amount);
  if (input.homeCurrency === 'USD' && input.usdEquivalent) return D(input.usdEquivalent);
  return undefined;
}

function decimalPlaces(amount: string): number {
  const dot = amount.indexOf('.');
  if (dot < 0) return 0;
  return amount.length - dot - 1;
}

function plusOneYear(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const clamped = m === 2 && d === 29 ? 28 : d;
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
}
