import { roundToPayout } from '@/contracts/currencies';
import { isDecimalString } from '@/contracts/money';

/** Strip grouping and round to payout precision. Empty is `''`. Invalid is null. */
export function commitAmount(raw: string, currency: string): string | null {
  const cleaned = raw.replace(/,/g, '').trim();
  if (!cleaned) return '';
  if (!isDecimalString(cleaned)) return null;
  return roundToPayout(currency, cleaned);
}
