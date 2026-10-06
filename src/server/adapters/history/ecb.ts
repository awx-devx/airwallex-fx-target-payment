import { D } from '@/contracts/money';
import type { DailyMid } from '@/server/adapters/history/frankfurter';

export interface EcbObservation {
  currency: string;
  date: string;
  perEur: string;
}

/** Units of each currency per 1 EUR, from the ECB data API. */
export async function fetchEcbPerEur(input: {
  currencies: readonly string[];
  from: string;
  to: string;
}): Promise<Map<string, Map<string, string>>> {
  const currencies = [...new Set(input.currencies.filter((code) => code !== 'EUR'))];
  if (currencies.length === 0) return new Map();
  const url =
    `https://data-api.ecb.europa.eu/service/data/EXR/D.${currencies.join('+')}.EUR.SP00.A` +
    `?startPeriod=${input.from}&endPeriod=${input.to}&format=csvdata`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (response.status === 404) return new Map();
  if (!response.ok) throw new Error(`ECB returned ${response.status}`);
  return indexEcb(parseEcbCsv(await response.text()));
}

export function parseEcbCsv(text: string): EcbObservation[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const header = lines[0];
  if (!header) return [];
  const columns = splitCsv(header);
  const currency = columns.indexOf('CURRENCY');
  const period = columns.indexOf('TIME_PERIOD');
  const value = columns.indexOf('OBS_VALUE');
  if (currency < 0 || period < 0 || value < 0) return [];
  const points: EcbObservation[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsv(line);
    const code = cells[currency];
    const date = cells[period];
    const mid = cells[value];
    if (!code || !date || !mid) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    points.push({ currency: code, date, perEur: D(mid).toFixed() });
  }
  return points;
}

/** Canonical price: quote currency per 1 unit of base. */
export function crossEcb(
  pair: { base: string; quote: string },
  perEur: ReadonlyMap<string, ReadonlyMap<string, string>>,
): DailyMid[] {
  if (pair.base === pair.quote) return [];
  const dates = sharedDates(pair, perEur);
  const points: DailyMid[] = [];
  for (const date of dates) {
    const mid = priceOn(pair, perEur, date);
    if (mid) points.push({ date, mid });
  }
  return points;
}

function indexEcb(rows: readonly EcbObservation[]): Map<string, Map<string, string>> {
  const indexed = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const series = indexed.get(row.currency) ?? new Map<string, string>();
    series.set(row.date, row.perEur);
    indexed.set(row.currency, series);
  }
  return indexed;
}

function sharedDates(
  pair: { base: string; quote: string },
  perEur: ReadonlyMap<string, ReadonlyMap<string, string>>,
): string[] {
  if (pair.base === 'EUR') return [...(perEur.get(pair.quote)?.keys() ?? [])].sort();
  if (pair.quote === 'EUR') return [...(perEur.get(pair.base)?.keys() ?? [])].sort();
  const base = perEur.get(pair.base);
  const quote = perEur.get(pair.quote);
  if (!base || !quote) return [];
  return [...base.keys()].filter((date) => quote.has(date)).sort();
}

function priceOn(
  pair: { base: string; quote: string },
  perEur: ReadonlyMap<string, ReadonlyMap<string, string>>,
  date: string,
): string | undefined {
  if (pair.base === 'EUR') return perEur.get(pair.quote)?.get(date);
  const base = perEur.get(pair.base)?.get(date);
  if (!base) return undefined;
  if (pair.quote === 'EUR') return D('1').div(base).toFixed();
  const quote = perEur.get(pair.quote)?.get(date);
  if (!quote) return undefined;
  return D(quote).div(base).toFixed();
}

function splitCsv(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}
