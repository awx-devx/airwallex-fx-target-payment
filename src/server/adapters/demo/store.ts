import { SIM_PHASES, type SimPhase } from '@/contracts/sse';
import {
  noteDemoClock,
  type DemoClockState,
} from '@/server/adapters/clock/demo';
import { Redis } from 'ioredis';
import { z } from 'zod';

/**
 * DEMO-ONLY: the API and the worker share the demo clock, market nudges, and
 * Simulate runs through Redis. They are separate processes.
 * PROD: system clock, live rates, and no Simulate runs.
 */

const CLOCK_KEY = 'demo:clock';
const MARKET_KEY = 'demo:market';
const SHORT_KEY = 'demo:short-wallet';
const SIM_PREFIX = 'demo:sim:';
const SIM_TTL_SEC = 600;

const clockSchema = z.object({
  speed: z.number().positive(),
  realOrigin: z.number(),
  warpedOrigin: z.number(),
});

const simSchema = z.object({
  simId: z.string().min(1),
  billId: z.string().min(1),
  startedRealMs: z.number(),
  startedClockMs: z.number(),
  durationSec: z.number().positive(),
  overshootBps: z.number(),
  advanceEverySec: z.number().positive(),
  from: z.string().min(1),
  to: z.string().min(1),
  price: z.string().min(1),
  phase: z.enum(SIM_PHASES),
  lastTickSec: z.number(),
  lastAdvanceRealMs: z.number().nullable(),
});

export type SimRecord = z.infer<typeof simSchema>;

const marketSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('nudge'),
    base: z.string(),
    quote: z.string(),
    pips: z.number(),
  }),
  z.object({
    op: z.literal('ramp'),
    base: z.string(),
    quote: z.string(),
    price: z.string(),
    seconds: z.number(),
  }),
  z.object({
    op: z.literal('params'),
    base: z.string(),
    quote: z.string(),
    vol: z.string().optional(),
    drift: z.string().optional(),
  }),
  z.object({ op: z.literal('reset') }),
]);

export type MarketCommand = z.infer<typeof marketSchema>;

let redis: Redis | undefined;
let redisUrl: string | undefined;

async function client(url: string): Promise<Redis> {
  if (redis && redisUrl !== url) {
    await redis.quit();
    redis = undefined;
  }
  redisUrl = url;
  redis ??= new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  if (redis.status === 'wait') await redis.connect();
  return redis;
}

export async function closeDemoStore(): Promise<void> {
  const connection = redis;
  redis = undefined;
  redisUrl = undefined;
  if (connection) await connection.quit();
}

export async function readClock(url: string): Promise<DemoClockState | null> {
  const raw = await (await client(url)).get(CLOCK_KEY);
  if (!raw) return null;
  const parsed = clockSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export async function writeClock(
  url: string,
  state: DemoClockState,
): Promise<void> {
  await (await client(url)).set(CLOCK_KEY, JSON.stringify(state));
  noteDemoClock(state);
}

export async function refreshDemoClock(url: string): Promise<void> {
  noteDemoClock(await readClock(url));
}

export async function pushMarket(
  url: string,
  command: MarketCommand,
): Promise<void> {
  await (await client(url)).rpush(MARKET_KEY, JSON.stringify(command));
}

export async function drainMarket(url: string): Promise<MarketCommand[]> {
  const connection = await client(url);
  const commands: MarketCommand[] = [];
  for (;;) {
    const raw = await connection.lpop(MARKET_KEY);
    if (!raw) return commands;
    const parsed = marketSchema.safeParse(JSON.parse(raw));
    if (parsed.success) commands.push(parsed.data);
  }
}

export function simKey(billId: string): string {
  return `${SIM_PREFIX}${billId}`;
}

export async function readSim(
  url: string,
  billId: string,
): Promise<SimRecord | null> {
  const connection = await client(url);
  const raw = await connection.get(simKey(billId));
  if (!raw) return null;
  const parsed = simSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    await connection.del(simKey(billId));
    return null;
  }
  return parsed.data;
}

export async function createSim(
  url: string,
  record: SimRecord,
): Promise<boolean> {
  const created = await (
    await client(url)
  ).set(simKey(record.billId), JSON.stringify(record), 'EX', SIM_TTL_SEC, 'NX');
  return created === 'OK';
}

export async function writeSim(url: string, record: SimRecord): Promise<void> {
  await (
    await client(url)
  ).set(simKey(record.billId), JSON.stringify(record), 'EX', SIM_TTL_SEC);
}

export async function deleteSim(url: string, billId: string): Promise<void> {
  await (await client(url)).del(simKey(billId));
}

export async function listSims(url: string): Promise<SimRecord[]> {
  const connection = await client(url);
  const keys = await connection.keys(`${SIM_PREFIX}*`);
  if (keys.length === 0) return [];
  const raw = await connection.mget(...keys);
  const records: SimRecord[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const value = raw[index];
    if (!key || !value) continue;
    const parsed = simSchema.safeParse(JSON.parse(value));
    if (parsed.success) records.push(parsed.data);
    else await connection.del(key);
  }
  return records;
}

export async function simBillIds(url: string): Promise<Set<string>> {
  const records = await listSims(url);
  return new Set(records.map((record) => record.billId));
}

export async function scriptedPrice(
  url: string,
  billId: string,
): Promise<string | null> {
  const record = await readSim(url, billId);
  return record?.price ?? null;
}

export async function setShortWallet(
  url: string,
  enabled: boolean,
): Promise<void> {
  const connection = await client(url);
  if (enabled) await connection.set(SHORT_KEY, '1');
  else await connection.del(SHORT_KEY);
}

export async function shortWallet(url: string): Promise<boolean> {
  return (await (await client(url)).get(SHORT_KEY)) === '1';
}

export async function clearDemoKeys(url: string): Promise<void> {
  const connection = await client(url);
  const keys = await connection.keys('demo:*');
  if (keys.length > 0) await connection.del(...keys);
  noteDemoClock(null);
}

export type { SimPhase };
