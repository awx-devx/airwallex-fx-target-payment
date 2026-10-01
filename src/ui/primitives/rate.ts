import { pipSize } from '@/contracts/currencies';
import { D, significantPrice } from '@/contracts/money';
import type { CurrencyPair } from '@/ui/format';

/** Step the canonical price by `pips` of the quote actually on screen. */
export function stepPrice(
  canonical: string,
  pair: CurrencyPair,
  inverted: boolean,
  pips: number,
): string {
  const quote = inverted ? pair.base : pair.quote;
  const pip = D(pipSize(quote)).mul(String(pips));
  if (!inverted) return significantPrice(D(canonical).plus(pip));
  const displayed = D('1').div(D(canonical)).plus(pip);
  if (!displayed.greaterThan(0)) {
    throw new Error('Inverted price must stay positive');
  }
  return significantPrice(D('1').div(displayed));
}
