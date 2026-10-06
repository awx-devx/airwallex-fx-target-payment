import { parseAirwallexJson } from '@/server/adapters/airwallex/json';
import { isDecimalString } from '@/contracts/money';
import type { YahooInterval } from '@/contracts/chart';
import { Redis } from 'ioredis';

export interface YahooBar {
  time: number;
  close: string;
}

/**
 * DEMO-ONLY: Yahoo's unofficial chart endpoint supplies intraday FX mids.
 * PROD: a licensed intraday feed behind the same adapter.
 */
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const USER_AGENT = 'Mozilla/5.0 (compatible; fx-target-demo/1.0)';

let redis: Redis | undefined;

function client(url: string): Redis {
  redis ??= new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  return redis;
}

export async function closeYahooCache(): Promise<void> {
  const connection = redis;
  redis = undefined;
  if (connection) await connection.quit();
}

/** Cached Yahoo bars. A miss, an unknown pair, or a failed host returns without caching the failure. */
export async function loadYahooBars(input: {
  redisUrl: string;
  base: string;
  quote: string;
  interval: YahooInterval;
  range: string;
  step: number;
}): Promise<YahooBar[] | 'unknown'> {
  const key = `intraday:${input.base}:${input.quote}:${input.interval}:${input.range}`;
  const cached = await readCache(input.redisUrl, key);
  if (cached) return cached;
  const fresh = await fetchYahooBars(input);
  if (fresh !== 'unknown' && fresh.length > 0) {
    await writeCache(input.redisUrl, key, fresh, Math.max(60, input.step));
  }
  return fresh;
}

export async function fetchYahooBars(input: {
  base: string;
  quote: string;
  interval: YahooInterval;
  range: string;
}): Promise<YahooBar[] | 'unknown'> {
  const symbol = `${input.base}${input.quote}=X`;
  const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=${input.interval}&range=${input.range}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return 'unknown';
  if (!response.ok) throw new Error(`Yahoo returned ${response.status}`);
  return parseYahooChart(parseAirwallexJson(await response.text()));
}

/** `unknown` when Yahoo has no series for the symbol. Null closes are dropped. */
export function parseYahooChart(payload: unknown): YahooBar[] | 'unknown' {
  if (!payload || typeof payload !== 'object' || !('chart' in payload)) return 'unknown';
  const chart = payload.chart;
  if (!chart || typeof chart !== 'object') return 'unknown';
  const result = 'result' in chart ? chart.result : undefined;
  if (!Array.isArray(result) || result.length === 0) return 'unknown';
  const row = result[0];
  if (!row || typeof row !== 'object') return 'unknown';
  const timestamps = 'timestamp' in row ? row.timestamp : undefined;
  const indicators = 'indicators' in row ? row.indicators : undefined;
  if (!Array.isArray(timestamps) || !indicators || typeof indicators !== 'object') return 'unknown';
  const quote = 'quote' in indicators ? indicators.quote : undefined;
  const closes =
    Array.isArray(quote) && quote[0] && typeof quote[0] === 'object' && 'close' in quote[0]
      ? quote[0].close
      : undefined;
  if (!Array.isArray(closes)) return 'unknown';
  const bars: YahooBar[] = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const time = unixSeconds(timestamps[index]);
    const close = closes[index];
    if (time === undefined) continue;
    if (typeof close !== 'string' || !isDecimalString(close)) continue;
    bars.push({ time, close });
  }
  return bars;
}

/** Lossless JSON keeps every number as a decimal string. Unix seconds fit in a safe integer. */
function unixSeconds(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/.test(value)) return undefined;
  const time = Number(value);
  return Number.isSafeInteger(time) ? time : undefined;
}

async function readCache(url: string, key: string): Promise<YahooBar[] | undefined> {
  try {
    const connection = client(url);
    if (connection.status === 'wait') await connection.connect();
    const hit = await connection.get(key);
    if (!hit) return undefined;
    return parseCached(hit);
  } catch {
    return undefined;
  }
}

async function writeCache(url: string, key: string, bars: readonly YahooBar[], ttl: number): Promise<void> {
  try {
    const connection = client(url);
    if (connection.status === 'wait') await connection.connect();
    await connection.set(key, JSON.stringify(bars), 'EX', ttl);
  } catch {
    // A cache miss on the next read refetches. The chart still has this response.
  }
}

function parseCached(text: string): YahooBar[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const bars: YahooBar[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object') return undefined;
    const time = 'time' in row ? row.time : undefined;
    const close = 'close' in row ? row.close : undefined;
    if (typeof time !== 'number' || typeof close !== 'string' || !isDecimalString(close)) return undefined;
    bars.push({ time, close });
  }
  return bars;
}
