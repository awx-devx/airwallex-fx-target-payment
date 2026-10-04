import { parseAirwallexJson } from '@/server/adapters/airwallex/json';
import { D } from '@/contracts/money';

export interface DailyMid {
  date: string;
  mid: string;
}

/** ECB daily mids. `mid` is quote currency per one unit of base. */
export async function fetchFrankfurter(input: {
  base: string;
  quote: string;
  from: string;
  to: string;
}): Promise<DailyMid[]> {
  const url = `https://api.frankfurter.app/${input.from}..${input.to}?from=${input.base}&to=${input.quote}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Frankfurter returned ${response.status}`);
  return parseFrankfurter(parseAirwallexJson(await response.text()), input.quote);
}

export function parseFrankfurter(payload: unknown, quote: string): DailyMid[] {
  if (!payload || typeof payload !== 'object' || !('rates' in payload)) return [];
  const rates = payload.rates;
  if (!rates || typeof rates !== 'object') return [];
  const points: DailyMid[] = [];
  for (const [date, row] of Object.entries(rates)) {
    if (!row || typeof row !== 'object' || !(quote in row)) continue;
    const mid = row[quote as keyof typeof row];
    if (typeof mid !== 'string' && typeof mid !== 'number') continue;
    points.push({ date, mid: D(String(mid)).toFixed() });
  }
  points.sort((left, right) => (left.date < right.date ? -1 : 1));
  return points;
}
