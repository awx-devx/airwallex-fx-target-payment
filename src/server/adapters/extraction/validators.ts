import { getCurrency } from '@/contracts/currencies';
import type { ExtractedBill, ExtractedField, ExtractionWarning } from '@/contracts/extraction';
import { D } from '@/contracts/money';
import { downgrade } from '@/server/adapters/extraction/fields';

const IBAN_PATTERN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const BIC_PATTERN = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const SIX_DIGITS = /^\d{6}$/;

export function validateExtraction(
  bill: ExtractedBill,
  input: { homeCurrency: string; today: string; duplicate: boolean },
): ExtractedBill {
  const warnings: ExtractionWarning[] = [...bill.warnings];
  let next = { ...bill, bank: { ...bill.bank }, warnings };

  if (next.documentType !== 'invoice') {
    pushWarning(warnings, 'NOT_INVOICE', `Document is a ${next.documentType.replaceAll('_', ' ')}`);
  }

  next = {
    ...next,
    currency: checkCurrency(next.currency, input.homeCurrency, warnings),
    vendorCountry: checkCountry(next.vendorCountry),
    amountDue: checkAmount(next),
    issueDate: checkDates(next, input.today, warnings).issueDate,
    dueDate: checkDates(next, input.today, warnings).dueDate,
    bank: checkBankCountry(checkBank(next.bank, next.vendorName.value)),
  };

  if (input.duplicate && next.vendorName.value && next.invoiceNumber.value) {
    pushWarning(warnings, 'DUPLICATE', 'Another bill has this vendor, invoice number, and amount');
  }
  return { ...next, warnings };
}

export function ibanChecksumOk(iban: string): boolean {
  const compact = iban.replaceAll(/\s+/g, '').toUpperCase();
  if (!IBAN_PATTERN.test(compact)) return false;
  const rearranged = `${compact.slice(4)}${compact.slice(0, 4)}`;
  let remainder = 0;
  for (const char of rearranged) {
    const digits = char >= 'A' && char <= 'Z' ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

const REGION_ALIASES: Record<string, string> = {
  uk: 'GB',
  usa: 'US',
  'u.s.': 'US',
  'u.s.a.': 'US',
};

/** Current ISO 3166-1 alpha-2 assignments. Withdrawn codes such as DD share English names with current ones. */
const OFFICIAL_REGIONS = new Set(
  `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(
    ' ',
  ),
);

const regionCodes = new Map<string, string>();

function isoCountry(value: string): string | undefined {
  const compact = value.trim();
  const alias = REGION_ALIASES[compact.toLowerCase()];
  if (alias) return alias;
  const upper = compact.toUpperCase();
  if (OFFICIAL_REGIONS.has(upper)) return upper;
  ensureRegions();
  return regionCodes.get(compact.toLowerCase());
}

function ensureRegions(): void {
  if (regionCodes.size > 0) return;
  const display = new Intl.DisplayNames(['en'], { type: 'region' });
  for (const code of OFFICIAL_REGIONS) {
    const name = display.of(code);
    if (!name || regionCodes.has(name.toLowerCase())) continue;
    regionCodes.set(name.toLowerCase(), code);
  }
}

function checkCountry(field: ExtractedField): ExtractedField {
  if (!field.value) return field;
  const code = isoCountry(field.value);
  if (!code) return downgrade(field, 'Country is not an ISO code');
  return field.value === code ? field : { ...field, value: code };
}

function checkBankCountry(bank: ExtractedBill['bank']): ExtractedBill['bank'] {
  if (!bank.bankCountry) return bank;
  return { ...bank, bankCountry: checkCountry(bank.bankCountry) };
}

function checkCurrency(
  field: ExtractedField,
  homeCurrency: string,
  warnings: ExtractionWarning[],
): ExtractedField {
  if (!field.value) return downgrade(field, 'Currency is missing');
  const code = field.value.toUpperCase();
  if (!getCurrency(code)) return downgrade({ ...field, value: code }, 'Currency is not ISO 4217');
  if (code === homeCurrency) {
    pushWarning(warnings, 'HOME_CURRENCY', 'A bill in the home currency has nothing to convert');
    return downgrade({ ...field, value: code }, 'Currency is the home currency');
  }
  const info = getCurrency(code);
  if (info && !info.fx.convertAndPayout && !info.fx.buy) {
    return downgrade({ ...field, value: code }, `${code} is not payable`);
  }
  return field.value === code ? field : { ...field, value: code };
}

function checkAmount(bill: ExtractedBill): ExtractedField {
  const field = bill.amountDue;
  if (!field.value) return downgrade(field, 'Amount due is missing');
  let amount: ReturnType<typeof D>;
  try {
    amount = D(field.value);
  } catch {
    return downgrade(field, 'Amount is not a decimal');
  }
  if (!amount.gt(0)) return downgrade(field, 'Amount must be greater than zero');
  const precision = bill.currency.value ? getCurrency(bill.currency.value)?.payoutPrecision : undefined;
  if (precision !== undefined && decimalPlaces(field.value) > precision) {
    return downgrade(field, `${bill.currency.value} allows ${precision} decimal places`);
  }
  const sum = sumOf(bill.subtotal?.value, bill.tax?.value);
  if (sum && amount.minus(sum).abs().gt(minorUnit(precision ?? 2))) {
    return downgrade(field, 'Amount does not equal subtotal plus tax');
  }
  return field;
}

function checkDates(
  bill: ExtractedBill,
  today: string,
  warnings: ExtractionWarning[],
): { issueDate: ExtractedField; dueDate: ExtractedField } {
  let issueDate = bill.issueDate;
  let dueDate = bill.dueDate;
  if (issueDate.value && !ISO_DATE.test(issueDate.value)) {
    issueDate = downgrade(issueDate, 'Issue date must be YYYY-MM-DD');
  }
  if (!dueDate.value || !ISO_DATE.test(dueDate.value)) {
    return { issueDate, dueDate: downgrade(dueDate, 'Due date must be YYYY-MM-DD') };
  }
  const due = dueDate.value;
  if (issueDate.value && ISO_DATE.test(issueDate.value) && issueDate.value > due) {
    dueDate = downgrade(dueDate, 'Due date is before the issue date');
  }
  if (due > plusOneYear(today)) {
    dueDate = downgrade(dueDate, 'Due date is more than a year out');
  }
  if (due < today) {
    pushWarning(warnings, 'OVERDUE', 'Due date is in the past');
  }
  return { issueDate, dueDate };
}

function checkBank(bank: ExtractedBill['bank'], vendorName: string | null): ExtractedBill['bank'] {
  const next = { ...bank };
  if (next.iban?.value) {
    const compact = next.iban.value.replaceAll(/\s+/g, '').toUpperCase();
    next.iban = ibanChecksumOk(compact)
      ? { ...next.iban, value: compact }
      : downgrade({ ...next.iban, value: compact }, 'IBAN checksum failed');
  }
  if (next.bic?.value) {
    const bic = next.bic.value.replaceAll(/\s+/g, '').toUpperCase();
    next.bic = BIC_PATTERN.test(bic)
      ? { ...next.bic, value: bic }
      : downgrade({ ...next.bic, value: bic }, 'BIC format is invalid');
  }
  if (next.localBankCode?.value) {
    const code = next.localBankCode.value.replaceAll(/[\s-]/g, '').toUpperCase();
    const country = next.bankCountry?.value?.toUpperCase();
    const ok =
      (country === 'IN' && IFSC_PATTERN.test(code)) ||
      (country === 'GB' && SIX_DIGITS.test(code)) ||
      (country === 'AU' && SIX_DIGITS.test(code)) ||
      (!country && (IFSC_PATTERN.test(code) || SIX_DIGITS.test(code)));
    next.localBankCode = ok
      ? { ...next.localBankCode, value: code }
      : downgrade({ ...next.localBankCode, value: code }, 'Local bank code format is invalid');
  }
  if (next.accountName?.value && vendorName && !namesSimilar(next.accountName.value, vendorName)) {
    next.accountName = downgrade(next.accountName, 'Account name differs from the vendor', 'medium');
  }
  return next;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function pushWarning(warnings: ExtractionWarning[], code: ExtractionWarning['code'], message: string): void {
  if (warnings.some((warning) => warning.code === code)) return;
  warnings.push({ code, message });
}

function sumOf(subtotal: string | null | undefined, tax: string | null | undefined): ReturnType<typeof D> | undefined {
  if (!subtotal || !tax) return undefined;
  try {
    return D(subtotal).plus(tax);
  } catch {
    return undefined;
  }
}

function minorUnit(precision: number): ReturnType<typeof D> {
  if (precision <= 0) return D('1');
  return D(`0.${'0'.repeat(precision - 1)}1`);
}

function decimalPlaces(amount: string): number {
  const dot = amount.indexOf('.');
  return dot < 0 ? 0 : amount.length - dot - 1;
}

function plusOneYear(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  const d = month === '02' && day === '29' ? '28' : day;
  return `${Number(year) + 1}-${month}-${d}`;
}

function namesSimilar(left: string, right: string): boolean {
  const a = left.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
  const b = right.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
  if (a.length === 0 || b.length === 0) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  return shorter.length >= 4 && longer.includes(shorter);
}
