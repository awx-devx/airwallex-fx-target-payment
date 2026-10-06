import type { AppEvent } from '@/contracts/sse';
import { readRealMs } from '@/server/adapters/clock';
import type { DemoClockState } from '@/server/adapters/clock/demo';
import { readClock } from '@/server/adapters/demo/store';
import { getEnv } from '@/server/env';
import { getEventHub, openEventStream } from '@/server/events/hub';
import { requestLogger } from '@/server/http/requestId';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

export async function GET(request: Request): Promise<Response> {
  const env = getEnv();
  const hub = getEventHub();
  const log = requestLogger(request.headers);
  try {
    await hub.start(env.REDIS_URL);
  } catch (error) {
    log.warn({ err: error }, 'sse unavailable');
    return new Response('stream unavailable', { status: 503 });
  }
  log.info('sse connected');
  const stream = openEventStream({
    hub,
    signal: request.signal,
    hello: await helloEvent(env),
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

async function helloEvent(env: ReturnType<typeof getEnv>): Promise<Extract<AppEvent, { type: 'hello' }>> {
  let clock: DemoClockState | null = null;
  try {
    clock = await readClock(env.REDIS_URL);
  } catch {
    clock = null;
  }
  const real = readRealMs();
  const speed = clock?.speed ?? 1;
  const now = clock
    ? clock.warpedOrigin + (real - clock.realOrigin) * clock.speed
    : real;
  return {
    type: 'hello',
    feed: env.RATE_SOURCE === 'airwallex' ? 'AIRWALLEX' : 'SIMULATED',
    now: new Date(now).toISOString(),
    warp: { speed },
  };
}
