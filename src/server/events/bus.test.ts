import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/stream/route';
import type { AppEvent } from '@/contracts/sse';
import { formatSseComment, publish } from '@/server/events/bus';
import {
  getEventHub,
  openEventStream,
  resetEventHub,
} from '@/server/events/hub';

const tick: AppEvent = {
  type: 'tick',
  pair: { base: 'EUR', quote: 'USD' },
  billId: 'bill-1',
  ts: '2026-10-04T12:00:00.000Z',
  price: '1.08',
  source: 'SIMULATED',
};

afterAll(async () => {
  await resetEventHub();
});

describe('app events', () => {
  it('fans one published event out to every listener and the SSE route', async () => {
    const url = process.env.REDIS_URL ?? '';
    const hub = getEventHub();
    await hub.start(url);
    await hub.start(url);
    expect(hub.subscriberConnections).toBe(1);

    const seen: AppEvent[] = [];
    const stop = hub.listen((event) => seen.push(event));
    const publisher = new Redis(url);
    await publish(publisher, tick);
    await viWait(seen);

    const abort = new AbortController();
    const response = await GET(
      new Request('http://localhost/api/stream', { signal: abort.signal }),
    );
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('missing stream');
    await publish(publisher, { ...tick, price: '1.07' });
    const chunk = await readUntil(
      reader,
      (text) => text.includes('event: tick') && text.includes('"price":"1.07"'),
    );
    expect(chunk).toContain('event: tick');
    expect(chunk).toContain('"price":"1.07"');
    expect(hub.subscriberConnections).toBe(1);

    abort.abort();
    stop();
    await publisher.quit();
    await reader.cancel();
  });

  it('writes a heartbeat comment', async () => {
    const hub = getEventHub();
    const abort = new AbortController();
    const stream = openEventStream({
      hub,
      signal: abort.signal,
      heartbeatMs: 20,
    });
    const reader = stream.getReader();
    const text = await readUntil(reader, (value) =>
      value.includes(formatSseComment('ping')),
    );
    expect(text).toBe(formatSseComment('ping'));
    abort.abort();
    await reader.cancel();
  });
});

async function viWait(seen: AppEvent[]): Promise<void> {
  const started = Date.now();
  while (seen.length === 0) {
    if (Date.now() - started > 5_000)
      throw new Error('event was not delivered');
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  found: (text: string) => boolean,
): Promise<string> {
  const started = Date.now();
  let text = '';
  while (!found(text)) {
    if (Date.now() - started > 5_000) {
      throw new Error(`stream did not contain the expected event: ${text}`);
    }
    const { value, done } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }
  return text;
}
