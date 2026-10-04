import { getCurrency } from '@/contracts/currencies';
import { D, formatDecimal, significantPrice } from '@/contracts/money';
import Decimal from 'decimal.js';

/**
 * Canonical price and the quantities in docs/03 §2.
 * Every value is a decimal string. Callers pass the home-currency precision.
 */

export function canonicalPrice(sellAmount: string, buyAmount: string): string {
  const buy = D(buyAmount);
  if (buy.isZero()) throw new Error('buy amount is zero');
  return significantPrice(D(sellAmount).div(buy));
}

export function estimatedCost(
  amount: string,
  price: string,
  feeEstimate: string,
  homePrecision: number,
): string {
  return formatDecimal(D(amount).mul(price).plus(feeEstimate), homePrecision);
}

export function savings(
  amount: string,
  entryPrice: string,
  price: string,
  homePrecision: number,
): string {
  return formatDecimal(D(amount).mul(D(entryPrice).minus(price)), homePrecision);
}

/** Ratio `(entry − now) / entry`, rounded to 2 decimal places. */
export function savingsPercent(entryPrice: string, price: string): string {
  const entry = D(entryPrice);
  if (entry.isZero()) throw new Error('entry price is zero');
  return formatDecimal(entry.minus(price).div(entry), 2);
}

/**
 * `(now − target) / now` in basis points, rounded to an integer.
 * Zero or negative means the price is at or through the target.
 */
export function distanceBps(price: string, targetPrice: string): string {
  const now = D(price);
  if (now.isZero()) throw new Error('price is zero');
  const bps = now.minus(targetPrice).div(now).mul(10000).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  if (bps.isZero()) return '0';
  return bps.toFixed(0);
}

export function targetPriceFromMaxCost(
  maxCost: string,
  amount: string,
  feeEstimate: string,
): string {
  const bill = D(amount);
  if (bill.isZero()) throw new Error('bill amount is zero');
  const price = D(maxCost).minus(feeEstimate).div(bill);
  if (!price.gt(0)) throw new Error('max cost does not leave a positive target');
  return significantPrice(price);
}

export function maxCostFromTarget(
  amount: string,
  targetPrice: string,
  feeEstimate: string,
  homePrecision: number,
): string {
  return estimatedCost(amount, targetPrice, feeEstimate, homePrecision);
}

export function homePrecision(currency: string): number {
  const info = getCurrency(currency);
  if (!info) throw new Error(`Unknown currency ${currency}`);
  return info.payoutPrecision;
}
