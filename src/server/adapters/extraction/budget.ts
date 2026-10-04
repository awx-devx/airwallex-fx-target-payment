import { Redis } from 'ioredis';

const REFUSED = 'Extraction rate limit reached. Try again later.';
const UNRECORDED = 'Extraction rate limit could not be recorded';

const TAKE = `local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count`;

export class ExtractionBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionBudgetError';
  }
}

export interface ExtractionWindow {
  redisUrl: string;
  maxCalls: number;
  windowSec: number;
  nowMs: number;
}

/** Slots left in the current window. `0` max calls means the cap is off. */
export async function extractionAllowance(input: ExtractionWindow): Promise<number> {
  if (input.maxCalls === 0) return Number.POSITIVE_INFINITY;
  const used = await readCount(input);
  return Math.max(0, input.maxCalls - used);
}

/** Consume one Anthropic call. A Redis failure refuses the call. */
export async function takeExtractionCall(input: ExtractionWindow): Promise<void> {
  if (input.maxCalls === 0) return;
  const count = await increment(input);
  if (count > input.maxCalls) throw new ExtractionBudgetError(REFUSED);
}

export async function closeExtractionBudget(): Promise<void> {
  const current = redis;
  redis = undefined;
  if (current) await current.quit();
}

let redis: Redis | undefined;

function windowKey(input: ExtractionWindow): string {
  const windowMs = input.windowSec * 1000;
  return `extract:calls:${Math.floor(input.nowMs / windowMs)}`;
}

async function readCount(input: ExtractionWindow): Promise<number> {
  try {
    const client = await connect(input.redisUrl);
    const raw = await client.get(windowKey(input));
    return raw ? Number(raw) : 0;
  } catch (error) {
    if (error instanceof ExtractionBudgetError) throw error;
    throw new ExtractionBudgetError(UNRECORDED);
  }
}

async function increment(input: ExtractionWindow): Promise<number> {
  try {
    const client = await connect(input.redisUrl);
    const count = await client.eval(TAKE, 1, windowKey(input), String(input.windowSec));
    return typeof count === 'number' ? count : Number(count);
  } catch (error) {
    if (error instanceof ExtractionBudgetError) throw error;
    throw new ExtractionBudgetError(UNRECORDED);
  }
}

async function connect(url: string): Promise<Redis> {
  if (!redis || redis.status === 'end') {
    redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 2_000 });
  }
  if (redis.status === 'wait') await redis.connect();
  return redis;
}
