import { D, formatDecimal } from '@/contracts/money';

function fractionDigits(value: string): number {
  const point = value.indexOf('.');
  if (point === -1) return 0;
  return value.length - point - 1;
}

/**
 * Linear blend of two decimal strings. `progress` is a 0–1 decimal string
 * (an animation parameter, not money). The result keeps the wider scale.
 */
export function interpolateDecimal(
  from: string,
  to: string,
  progress: string,
): string {
  const t = DecimalClamp(progress);
  const start = D(from);
  const end = D(to);
  const digits = Math.max(fractionDigits(from), fractionDigits(to));
  return formatDecimal(start.plus(end.minus(start).mul(t)), digits);
}

function DecimalClamp(progress: string) {
  const t = D(progress);
  if (t.isNegative()) return D('0');
  if (t.greaterThan(1)) return D('1');
  return t;
}
