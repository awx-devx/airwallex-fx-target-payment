import { requireCurrency } from '@/contracts/currencies';
import { D, formatDecimal } from '@/contracts/money';
import type Decimal from 'decimal.js';

/** Canonical display pair: base is the bill currency F, quote is home H. */
export interface CurrencyPair {
  base: string;
  quote: string;
}

const MINUS = '−';

/**
 * Display decimals for a price. JPY-quoted pairs use 3; everything else uses 5.
 * The quote is the quote of the pair actually on screen.
 */
export function priceFractionDigits(quote: string): number {
  return quote === 'JPY' ? 3 : 5;
}

export function formatPair(
  pair: CurrencyPair,
  options?: { inverted?: boolean },
): string {
  return options?.inverted
    ? `${pair.quote}/${pair.base}`
    : `${pair.base}/${pair.quote}`;
}

/**
 * Format canonical price `p` (H per 1 F). `inverted` shows `1/p` and treats
 * the base as the quote for decimal places. Display only — logic stays on `p`.
 */
export function formatPrice(
  pair: CurrencyPair,
  value: string,
  options?: { inverted?: boolean },
): string {
  const inverted = options?.inverted ?? false;
  const amount = inverted ? invert(value) : D(value);
  const quote = inverted ? pair.base : pair.quote;
  return formatDecimal(amount, priceFractionDigits(quote));
}

function invert(value: string): Decimal {
  const price = D(value);
  if (price.isZero()) throw new Error('Cannot invert a zero price');
  return D('1').div(price);
}

/**
 * Grouped amount at the currency's Airwallex payout precision, with the code
 * as a suffix (`250,000.00 EUR`). `signed` prefixes a positive amount with +.
 * Negatives always use a minus. Zero has no sign.
 */
export function formatMoney(
  currency: string,
  value: string,
  options?: { signed?: boolean },
): string {
  const digits = requireCurrency(currency).payoutPrecision;
  return `${formatGrouped(D(value), digits, options?.signed ?? false)} ${currency}`;
}

export type DeltaMode = 'abs' | 'pct' | 'bps';

/**
 * Signed change. `pct` treats `value` as a ratio (`0.0042` → `+0.42%`).
 * `bps` is a basis-point count. `abs` is a price change; pass `pair` to use
 * that pair's display decimals. Zero has no sign.
 */
export function formatDelta(
  value: string,
  options?: { mode?: DeltaMode; pair?: CurrencyPair },
): string {
  const amount = D(value);
  const mode = options?.mode ?? 'abs';
  if (mode === 'pct') {
    return `${formatGrouped(amount.mul(100), 2, true)}%`;
  }
  if (mode === 'bps') {
    const digits = Math.min(2, fractionDigits(value));
    return `${formatGrouped(amount, digits, true)} bps`;
  }
  const digits = options?.pair
    ? priceFractionDigits(options.pair.quote)
    : fractionDigits(value);
  return formatGrouped(amount, digits, true);
}

/** Remaining time as `MM:SS`, `H:MM:SS`, or `Dd HH:MM:SS`. Negatives clamp to 0. */
export function formatCountdown(totalSeconds: number): string {
  const safe =
    Number.isFinite(totalSeconds) && totalSeconds > 0
      ? Math.floor(totalSeconds)
      : 0;
  const days = Math.floor(safe / 86_400);
  const hours = Math.floor((safe % 86_400) / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}:${mm}:${ss}`;
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export type Direction = 'favorable' | 'adverse' | 'neutral';

/**
 * Colour for a change in canonical price `p`. A decrease is favourable
 * (the bill gets cheaper). Never call this with an inverted display delta.
 */
export function favorable(delta: string): Direction {
  const change = D(delta);
  if (change.isZero()) return 'neutral';
  return change.isNegative() ? 'favorable' : 'adverse';
}

/** Last two digits of a formatted price, for pip emphasis. */
export function splitPips(formatted: string): { head: string; pips: string } {
  const match = formatted.match(/^(.*)(\d{2})$/);
  if (!match) return { head: formatted, pips: '' };
  return { head: match[1] ?? '', pips: match[2] ?? '' };
}

function fractionDigits(value: string): number {
  const point = value.indexOf('.');
  if (point === -1) return 0;
  return value.length - point - 1;
}

function formatGrouped(
  value: Decimal,
  digits: number,
  signed: boolean,
): string {
  const negative = value.isNegative() && !value.isZero();
  const fixed = formatDecimal(value.abs(), digits);
  const [ints, frac] = fixed.split('.');
  const grouped = (ints ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = frac !== undefined ? `${grouped}.${frac}` : grouped;
  if (negative) return `${MINUS}${body}`;
  if (signed && value.greaterThan(0)) return `+${body}`;
  return body;
}
