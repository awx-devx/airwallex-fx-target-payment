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
  await hub.start(env.REDIS_URL);
  const log = requestLogger(request.headers);
  log.info('sse connected');
  const stream = openEventStream({ hub, signal: request.signal });
  return new Response(stream, { headers: SSE_HEADERS });
}
