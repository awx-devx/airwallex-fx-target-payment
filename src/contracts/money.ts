import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Decimal strings only: no exponents, no leading zeros. */
export const DECIMAL_STRING = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function isDecimalString(value: string): boolean {
  return DECIMAL_STRING.test(value);
}

export function D(value: string | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  if (!isDecimalString(value)) {
    throw new Error(`Not a decimal string: ${value}`);
  }
  return new Decimal(value);
}

/**
 * A decimal string `D()` accepts. `Decimal#toString()` switches to an exponent
 * at about 1e-7, which this regex rejects.
 */
export function decimalString(value: Decimal): string {
  return value.toFixed();
}

/** Round half up and keep exactly `fractionDigits` digits after the point. */
export function formatDecimal(value: Decimal, fractionDigits: number): string {
  return value
    .toDecimalPlaces(fractionDigits, Decimal.ROUND_HALF_UP)
    .toFixed(fractionDigits);
}

/** Canonical prices are stored with 10 significant digits (docs/03 §2.4). */
export function significantPrice(value: Decimal): string {
  const scaled = value.toSignificantDigits(10, Decimal.ROUND_HALF_UP);
  return scaled.toFixed();
}
